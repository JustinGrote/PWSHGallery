// Entrypoint for the Registration handler
import { XMLParser } from 'fast-xml-parser'
import { StatusCodes } from 'http-status-codes'
import {
	maxSatisfying,
	minSatisfying,
	parse as parseSemVer,
	SemVer,
} from 'semver'
import { IttyRequest } from './ittyUtil'
import { throwIfNull } from './nullUtils'

// TODO: Make this configurable
const v2OriginEndpoint = 'https://www.powershellgallery.com/api/v2'
let cache: Cache = caches.default

//** Used to translate the Nuget v2 XML to JSON */
// TODO: Parse the info directly to a converted CatalogEntry rather than the intermediate storage step
const xml = new XMLParser({
	ignoreAttributes: false,
	textNodeName: '__value',
})

export async function registrationIndexHandler(
	request: IttyRequest,
	_env: any,
	context: ExecutionContext
) {
	const cachedResponse = await getCachedResponse(request)
	if (cachedResponse) {
		console.log(`CACHE HIT: ${request.url}`)
		return cachedResponse
	}

	/** We want to get our "base" URI for the registration Endpoint for purposes of building '@id' URIs */
	let registrationEndpoint = request.url
		.trim()
		.substring(0, request.url.lastIndexOf('/') + 1)
	const { id } = request.params
	const response = await getRegistrationIndex(registrationEndpoint, id)
	context.waitUntil(saveCachedResponse(request, response, 600))
	return response
}

export async function registrationPageHandler(
	request: IttyRequest,
	_env: any,
	context: ExecutionContext
) {
	const cachedResponse = await getCachedResponse(request)
	if (cachedResponse) {
		console.log(`CACHE HIT: ${request.url}`)
		return cachedResponse
	}

	/** We want to get our "base" URI for the registration Endpoint for purposes of building '@id' URIs */
	let registrationBase = request.url
		.trim()
		.substring(0, request.url.lastIndexOf('page'))

	// TODO: Type this, maybe with a generic?
	const { id, page } = request.params
	// TODO: Deduplicate this with getRegistrationIndex
	const packageInfos = await fetchDependencyInfo(v2OriginEndpoint, id)
	if (packageInfos instanceof Response) {
		return packageInfos
	}
	const index = new Index(registrationBase, packageInfos, true)
	const selectedPage = index.items.find(
		(item) => item['@id'].split('/').at(-1) === page
	)
	if (!selectedPage) {
		return new Response(
			'The registration page you requested does not exist. You probably either did not parse the @id from the index properly, or you guessed for this URI (shame on you)',
			{ status: StatusCodes.NOT_FOUND }
		)
	}
	const responseBody = toJSON(selectedPage)
	const response = new Response(responseBody)
	if (response.ok) {
		// Dont cache errors
		context.waitUntil(saveCachedResponse(request, response, 86400))
	}
	return response
}

/**
 * Handles queries for registrations by proxying calls to Powershell Gallery
 */
// TODO: Redo this to abstract out the response part
async function getRegistrationIndex(endpoint: string, id: string) {
	console.log(`Registration Query for ${id}`)

	const packageInfos = await fetchDependencyInfo(v2OriginEndpoint, id)
	// A responseBody rather than what we want is probably an error and we will pass it thru.
	if (packageInfos instanceof Response) {
		return packageInfos
	}

	// TODO: Index should inline the latest version and provide version ranges for remaining packages
	const index = new Index(endpoint, packageInfos)

	// Converts the object to a JSON representation
	const responseBody = toJSON(index)
	return new Response(responseBody)
}

/** Generic serializer that takes into account issues with certain items */
function toJSON(object: any) {
	// HACK: Monkey patch the SemVer class to return just the string when JSON serialized
	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#tojson_behavior
	const semVerPrototype = SemVer.prototype as any
	semVerPrototype.toJSON = function (this: SemVer) {
		// If we only have a build, we will assume this is a SystemVersion
		if (this.build[0] && !this.prerelease[0]) {
			return `${this.major}.${this.minor}.${this.patch}.${this.build[0]}`
		}
		return this.raw
	}

	// Converts the object to a JSON representation
	return JSON.stringify(object, null, 2)
}

/** Fetch Nuget v2 dependency data from the source PSGallery server. Other functions handle the processing of this */
async function fetchDependencyInfo(
	v2Endpoint: string,
	id: string,
	cacheLifetimeSeconds: number = 86400
) {
	// TODO: Proper Typing and building this request
	const requestUri = `${v2Endpoint}/FindPackagesById()?id='${id}'&semVerLevel=2.0.0&$orderby=IsLatestVersion desc,IsAbsoluteLatestVersion desc,Created desc&$select=GUID,NormalizedVersion,Dependencies,IsLatestVersion,IsAbsoluteLatestVersion`
	// We make an eager fetch for all versions and their dependencies
	console.log(`${id} ORIGIN REQUEST: ${requestUri}`)
	const originResponse = await fetch(requestUri, {
		headers: {
			Accept: 'application/atom+xml',
			'Accept-Encoding': 'gzip',
		},
		cf: {
			cacheEverything: true,
			// Package specific queries are immutable so we should cache these basically forever
			// TODO: Increase this to 1 month (Cloudflare Max) after stable
			// TODO: Periodic background check and cache invalidate if needed
			cacheTtl: cacheLifetimeSeconds,
		},
	})

	const responseText = await originResponse.text()

	// TODO: Use the type hints in the XML attributes with JSON-LD
	// TODO: Validate the info is what we expect, right now it just gets shaped to the interface without validation.
	// This is reasonably safe since we know PSGallery, may cause issues with third party nuget quirks later
	//FX
	let responseXML = xml.parse(responseText)
	// Make sure responseXML.feed.entry is an array
	let packageInfos: NugetV2PackageInfo[] = Array.isArray(responseXML.feed.entry)
		? responseXML.feed.entry
		: [responseXML.feed.entry]

	// TODO: If a nextlink exists, we meed to bring this along with us and expose a separate cache page for those results
	// Queries to the nextlink would be rare, for very old packages.
	const nextLink = getNextLink(responseXML)

	if (!packageInfos) {
		return new Response(`No packages found named ${id}`, {
			status: StatusCodes.NOT_FOUND,
		})
	}

	console.log(`${id}: ${packageInfos.length} packages found`)
	return packageInfos
}

/** Returns the NextLink of a function, if present */
function getNextLink(xml: any): string | undefined {
	const links: any[] = Array.isArray(xml.feed.link)
		? xml.feed.link
		: [xml.feed.link]
	const link = links.find((link: any) => link['@_rel'] === 'next')
	return link ? link.href : undefined
}

function parseNugetV2DependencyString(
	registrationEndpoint: string,
	nugetV2depInfo: string
) {
	const deps = nugetV2depInfo.split('|')
	return deps.map<Dependency>((dep) => {
		const [id, v2Range] = dep.split(':')

		// For PS and Nuget v2, a specified version actually means a minimum version, we need to fix that here
		const range = v2Range.match(/^\d.+/) ? `[${v2Range}, )` : v2Range

		const endpoint =
			registrationEndpoint.substring(
				0,
				registrationEndpoint.lastIndexOf('/', registrationEndpoint.length - 2) +
					1
			) +
			id +
			'/index.json'
		return {
			id: id,
			range: range,
			registration: endpoint,
		}
	})
}

/** Convert a nuget v2 version to a SemVer. This includes dotnet Assembly Version translation */
function parseNugetV2Version(version: string) {
	const dotnetAssemblyVersionRegex = /^\d+\.\d+\.\d+\.\d+$/
	if (dotnetAssemblyVersionRegex.test(version)) {
		const [major, minor, build, revision] = version.split('.')
		return parseSemVer(`${major}.${minor}.${build}+${revision}`)
	}
	return parseSemVer(version)
}

interface NugetV2PackageInfo {
	id: string
	content: {
		'@_type': string
		'@_src': string
	}
	title: {
		__value: string
	}
	'm:properties': {
		'd:NormalizedVersion': string
		'd:GUID'?: string
		'd:Dependencies'?: string
		'd:IsLatestVersion'?: {
			__value: boolean
		}
		'd:IsAbsoluteLatestVersion'?: {
			__value: boolean
		}
	}
}

/**
 * Nuget v3 Registration Index
 * @see https://docs.microsoft.com/en-us/nuget/api/registration-base-url-resource#registration-index
 */
class Index {
	count: number
	items: Page[]
	constructor(
		endpoint: string,
		v2Infos: NugetV2PackageInfo[],
		inlineAll?: boolean
	) {
		this.items = []
		// We are going to splice this and dont want to mess with the original array
		const myv2Infos = Array.from(v2Infos)

		const latest = myv2Infos.find(
			(v2Info) => v2Info['m:properties']['d:IsLatestVersion']?.__value
		)
		if (latest) {
			// TODO: Handle case where the latest version is hidden. Right now it just goes into otherversions
			const latestPageLeaf: Leaf = new Leaf(endpoint, latest)
			console.log(`Latest: ${latestPageLeaf.catalogEntry.version}`)
			this.items.push(
				new Page(endpoint, [latestPageLeaf], 'latest', inlineAll ?? true)
			)
			const removedItem = myv2Infos.splice(myv2Infos.indexOf(latest), 1)
			if (removedItem[0] != latest) {
				throw new Error(
					`Removed latest item ${removedItem} does not match latest prerelease item ${latest}. This is a bug.`
				)
			}
		}

		//TODO: Deduplicate latest and prerelease into a separate function
		// NOTE: This must come after latest, because the same package may be both latest and absoluteLatest and we want that
		// kind of package to be recognized as a latest and not a prerelease
		const latestPrerelease = myv2Infos.find(
			(v2Info) => v2Info['m:properties']['d:IsAbsoluteLatestVersion']?.__value
		)
		if (latestPrerelease) {
			const latestPrereleasePageLeaf: Leaf = new Leaf(
				endpoint,
				latestPrerelease
			)
			console.log(
				`Prerelease: ${latestPrereleasePageLeaf.catalogEntry.version}`
			)
			this.items.push(
				new Page(
					endpoint,
					[latestPrereleasePageLeaf],
					'prerelease',
					inlineAll ?? true
				)
			)
			const removedItem = myv2Infos.splice(
				myv2Infos.indexOf(latestPrerelease),
				1
			)
			if (removedItem[0] != latestPrerelease) {
				throw new Error(
					`Removed prerelease item ${removedItem} does not match latest prerelease item ${latestPrerelease}. This is a bug.`
				)
			}
		}

		if (!this.items) {
			throw new Error(
				`No latest version(s) found. This is a bug and should not happen with the FindPackagesById query because unlisted packages should be excluded so there should never be a case where both IsLatestVersion and IsAbsoluteLatestVersion are false on all objects`
			)
		}

		// TODO: Tabulate this in a server-definable setting so the individual pages are static and infinitely cacheable
		// Construct a page consisting of all the other entries
		if (myv2Infos.length != 0) {
			const otherPageLeaves = myv2Infos.map(
				(v2Info) => new Leaf(endpoint, v2Info)
			)
			this.items.push(
				new Page(endpoint, otherPageLeaves, 'olderVersions', inlineAll ?? false)
			)
		}

		this.count = this.items.length
	}
}

async function getCachedResponse(request: IttyRequest) {
	const response = await cache.match(request.url)
	if (response) {
		return response
	}
	return undefined
}

async function saveCachedResponse(
	request: IttyRequest,
	response: Response,
	ttl?: number
) {
	if (ttl) {
		response.headers.append('Cache-Control', `max-age=${ttl}`)
	}
	await cache.put(request.url, response.clone())
}

/**
 * Nuget v3 Registration Page
 * https://learn.microsoft.com/en-us/nuget/api/registration-base-url-resource#registration-pages-and-leaves
 */
class Page {
	'@id': string
	lower: SemVer
	upper: SemVer
	count: number
	parent?: string
	items?: Leaf[]
	constructor(
		endpoint: string,
		leaf: Leaf[],
		pageName?: string,
		inline: boolean = false
	) {
		if (leaf.length === 0) {
			throw new Error(`Cannot create a page with no leaves`)
		}
		const versions = leaf.map((leaf) => leaf.catalogEntry.version)
		this.count = leaf.length
		this.items = inline ? leaf : undefined
		this.lower =
			minSatisfying<SemVer>(versions, '*', {
				includePrerelease: true,
			}) ?? throwIfNull('no lower bound found. This should never happen.')
		this.upper =
			maxSatisfying<SemVer>(versions, '*', {
				includePrerelease: true,
			}) ?? throwIfNull('no upper bound found. This should never happen.')
		this['@id'] =
			endpoint + 'page/' + (pageName ?? this.lower + '_' + this.upper)
		this.parent = endpoint + 'index.json'
	}
}

class Leaf {
	'@id': string
	catalogEntry: CatalogEntry
	/** The URL to download the .nupkg file */
	packageContent: string
	// Creates a leaf and all related child items from a NugetV2 Package
	constructor(registrationEndpoint: string, packageInfo: NugetV2PackageInfo) {
		const nugetV2Version = packageInfo['m:properties']['d:NormalizedVersion']
		const version =
			parseNugetV2Version(packageInfo['m:properties']['d:NormalizedVersion']) ??
			throwIfNull<SemVer>(
				`Version ${packageInfo['m:properties']['d:NormalizedVersion']} to a semantic version. This is a bug.`
			)

		const basePackageVersionUri = registrationEndpoint + nugetV2Version
		this.packageContent = packageInfo.content['@_src']

		this.catalogEntry = {
			'@id': basePackageVersionUri + '.json',
			id: packageInfo.title.__value,
			version: version,
		}

		// BUG: This is not routed in the worker but is also generally not referenced.
		// Need to fix this up to be cleaner
		this['@id'] = basePackageVersionUri + '/pageLeaf'
		const dependencies = packageInfo['m:properties']['d:Dependencies']
		this.catalogEntry.dependencyGroups = dependencies
			? [new DependencyGroup(registrationEndpoint, dependencies)]
			: []
	}
}

interface CatalogEntry {
	'@id': string
	id: string
	version: SemVer
	dependencyGroups?: DependencyGroup[]
	listed?: boolean
	published?: string
	registration?: string
	/**
	 * Creates a new Leaf from a Nuget v2 Package Info. Useful for converting from the Nuget v2 API
	 * @param registrationEndpoint #The base path of the registration endpoint, we use this for constructing IDs
	 * @param packageInfo The Nuget v2 Package Info
	 */
}

class DependencyGroup {
	constructor(registrationEndpoint: string, nugetV2depInfo: string) {
		this.dependencies = parseNugetV2DependencyString(
			registrationEndpoint,
			nugetV2depInfo
		)
	}
	targetFramework?: string
	dependencies?: Dependency[]
}

interface Dependency {
	id: string
	range?: string
	registration?: string
}

function newBadRequest(message: string) {
	return new Response(message, {
		status: StatusCodes.BAD_REQUEST,
	})
}
