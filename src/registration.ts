// Entrypoint for the Registration handler
import { XMLParser } from 'fast-xml-parser'
import { Context } from 'hono'
import { StatusCodes } from 'http-status-codes'
import { maxSatisfying, minSatisfying, parse as parseSemVer, SemVer } from 'semver'
import { throwIfNull } from './nullUtils.js'
import urlJoinHelper from 'url-join'

const testUrl = 'http://test'

/** Helper function to combine URLs, because the builtin URL does not combine relative paths well with a base */

type URLOrString = URL | string
function urlJoin(...urlParts: URLOrString[]) {
	const parts = urlParts.map(u => u.toString())
	return new URL(urlJoinHelper(...parts))
}

// TODO: Make this configurable
const v2OriginEndpoint = 'http://www.powershellgallery.com/api/v2'

//** Used to translate the Nuget v2 XML to JSON */
// TODO: Parse the info directly to a converted CatalogEntry rather than the intermediate storage step
const xml = new XMLParser({
	ignoreAttributes: false,
	textNodeName: '__value',
})

export async function registrationIndexHandler(honoContext: Context) {
	const { req: request, executionCtx: context } = honoContext

	// This is used to build the '@id' URLs within the index
	let baseUrl = new URL(request.url).origin

	const { id } = request.param()
	const index = await getRegistrationIndex(baseUrl, id, context)

	// If we get a response instead of an index, its probably bad, and we need to return it to the user
	if (index instanceof Response) {
		return index
	}

	const response = new Response(toJSON(index))
	response.headers.append('Cache-Control', 'max-age=86400')
	return response
}

export async function registrationPageHandler(honoContext: Context) {
	const { req: request, executionCtx: context } = honoContext
	return new Response(
		'Not Implemented - This should return a cached page, need to add logic if it doesnt like if it is deeplinked',
		{ status: StatusCodes.NOT_IMPLEMENTED }
	)

	// HACK: TrieRouter doesnt support period delimiters: https://github.com/honojs/hono/issues/737
	const { id, 'page.json': pageNameRaw } = request.param()

	// This is used to build the '@id' URLs within the index
	// let baseUrl = new URL(request.url).origin

	// const page = await getRegistrationPage(baseUrl, id, context, pageNameRaw)

	// // If we get a response instead of an index, its probably bad, and we need to return it to the user
	// if (page instanceof Response) {
	// 	return page
	// }

	// const responseBody = toJSON(page)
	// const response = new Response(responseBody, {
	// 	headers: {
	// 		'content-type': 'application/json;charset=UTF-8',
	// 		'cache-control': 'max-age: 86400',
	// 	},
	// })
	// return response
}

export async function registrationPageLeafHandler(request: Request, _env: any, context: ExecutionContext) {
	/** We want to get our "base" URI for the registration Endpoint for purposes of building '@id' URIs */
	const origin = new URL(request.url).origin
	// TODO: Type this, maybe with a generic?
	const { id, lower, upper } = request.param()

	const dependencyResponse = await getRegistrationIndex(v2OriginEndpoint, id, context)

	// A responseBody rather than what we want is probably an error and we will pass it thru.
	if (dependencyResponse instanceof Response) {
		return dependencyResponse
	}
}

/**
 * Handles queries for registrations by proxying calls to Powershell Gallery
 */
// TODO: Redo this to abstract out the response part
async function getRegistrationIndex(registrationBase: string, id: string, context: ExecutionContext) {
	console.debug(`Registration Index Query for ${id}`)

	const dependencyResponse = await fetchOriginPackageInfo(v2OriginEndpoint, id)
	// A responseBody rather than what we want is probably an error and we will pass it thru.
	if (dependencyResponse instanceof Response) {
		return dependencyResponse
	}

	const nextLink = dependencyResponse.nextLink
	const index = new Index(registrationBase, id, dependencyResponse.packageInfos, nextLink !== undefined)

	// We want to process remaining packages in the background so as not to block the response.
	if (nextLink) {
		const cache = await caches.open('pwshgallery')
		const fetchRemainingPackages = async (nextLink: URL, id: string, index: Index, registrationBase: string | URL) => {
			registrationBase = new URL(registrationBase)
			const remainingPackages = await fetchOriginRemainingPackageInfo(nextLink)
			console.debug(`Found ${remainingPackages.length} remaining packages`)
			const olderPackagesPage = new Page(urlJoin(registrationBase, id), remainingPackages, index['@id'], 'older')

			// Replace the page anchor with a direct link
			olderPackagesPage.parent = new URL(olderPackagesPage['@id'].toString().replace(/index\.json#.+$/, 'index.json'))
			olderPackagesPage['@id'] = new URL(
				olderPackagesPage['@id'].toString().replace(/index\.json#(page\/.+?)$/, '$1.json')
			)

			const pageUrl = olderPackagesPage['@id']
			console.debug(`${id}: Caching page ${pageUrl}`)
			// hono cache middleware should pick this up when it is requested
			// TODO: Middleware might need to wait for this to show up in cache if we know index was called
			const olderPackagesPageResponse = new Response(toJSON(olderPackagesPage))
			olderPackagesPageResponse.headers.append('Cache-Control', 's-maxage=3600')
			await cache.put(pageUrl, olderPackagesPageResponse)
		}
		// await fetchRemainingPackages(nextLink, id, index, registrationBase)
		context.waitUntil(fetchRemainingPackages(nextLink, id, index, registrationBase))
	}

	// We only want the stub so the client gets minimal/most common data and can query for more
	return await index.compress()
}

/**
 * Retrieves the pages from the index fetched from PowerShell gallery
 */
export async function getRegistrationPage(baseUri: string, id: string, context: ExecutionContext, page: string) {
	const index = await getRegistrationIndex(baseUri, id, context)

	// A responseBody rather than what we want is probably an error and we will pass it thru.
	if (index instanceof Response) {
		return index
	}

	// TODO: Write a function that, if the page name is "older", wait until the cache is populated. This will avoid a race condition error.
	const selectedPage = index.items.find(item => item['@id'].toString().split('/').at(-1) === page)
	if (!selectedPage) {
		return new Response(
			'The registration page you requested does not exist. You probably either did not parse the @id from the index properly, or you guessed for this URI (shame on you). If you requested older, the main index may not have finished background caching yet and you should retry',
			{ status: StatusCodes.NOT_FOUND }
		)
	}
	return selectedPage
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

interface OriginPackageInfoResponse {
	packageInfos: NugetV2PackageInfo[]
	nextLink: URL | undefined
}

/** Fetch Nuget v2 package data from the source PSGallery server. Other functions handle the processing of this data.
 * if there are more results than fit in the first request, a nextLink will also be returned.
 */
async function fetchOriginPackageInfo(
	v2Endpoint: string,
	id: string,
	cacheLifetimeSeconds: number = 3600
): Promise<OriginPackageInfoResponse | Response> {
	// TODO: Proper Typing and building this request
	console.debug(`Getting Packages for ${id} from ${v2Endpoint}`)
	const requestUri = new URL(
		`${v2Endpoint}/FindPackagesById()?id='${id}'&semVerLevel=2.0.0&$orderby=IsLatestVersion desc,IsAbsoluteLatestVersion desc,Created desc&$select=GUID,Version,NormalizedVersion,Dependencies,IsLatestVersion,IsAbsoluteLatestVersion`
	)
	return await fetchOriginPackageInfoByUrl(requestUri, cacheLifetimeSeconds)
}

async function fetchOriginPackageInfoByUrl(url: URL, cacheLifetimeSeconds: number = 3600) {
	// We make an eager fetch for all versions and their dependencies
	console.debug(`ORIGIN REQUEST: ${url}`)
	const originResponse = await fetch(url.toString(), {
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

	if (!originResponse.ok) {
		return originResponse
	}

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
	// Queries to the nextlink would be expected to be rare, for very old packages.
	const nextLink = getNextLink(responseXML)

	if (packageInfos[0] === undefined) {
		return new Response(`No packages found`, {
			status: StatusCodes.NOT_FOUND,
		})
	}

	console.debug(`${url}: ${packageInfos.length} packages found`)
	return {
		packageInfos: packageInfos,
		nextLink: nextLink,
	}
}

/** Get remaining package info from nextLink using an aggressive readahead process. This is typically used in the waitUntil so we can return newest results quickly and cache all results for follow-up from the user */
// TODO: Add a upper threshold in the event the number of fetches is greater than 50 (this would require a package to have more than 5000 versions...)
async function fetchOriginRemainingPackageInfo(nextLink: URL, throttle = 5) {
	// parse the nextLink to find out what our jump size is
	const skipString = nextLink.searchParams.get('$skip')
	if (!skipString) {
		throw new Error('No $skip parameter found in nextLink, this is a bug')
	}
	const skipSize = parseInt(skipString)

	let skip = skipSize.valueOf()
	let noMoreNextLinkFound = false

	// Start by creating immediately fetch tasks matching the throttle, and continue to create tasks until we no longer see a nextLink meaning we are complete
	const fetchTasks: Promise<OriginPackageInfoResponse | Response>[] = []
	const packageInfos: NugetV2PackageInfo[] = []
	while (!noMoreNextLinkFound) {
		const currentNextLink = new URL(nextLink.toString())
		currentNextLink.searchParams.set('$skip', skip.toString())
		console.debug(`Fetching additional package info chunk ${skip} from ${currentNextLink}`)
		fetchTasks.push(fetchOriginPackageInfoByUrl(currentNextLink))
		skip += skipSize
		if (fetchTasks.length < throttle) {
			continue
		}
		if (fetchTasks.length > throttle) {
			throw new Error('outstanding tasks higher than the throttle. This is a bug')
		}

		// Wait for the first task to complete, then check if we have a nextLink, if we do, we will create a new task
		const currentTaskResult = await fetchTasks.shift()
		if (currentTaskResult === undefined) {
			throw 'this should never happen'
		}
		if (currentTaskResult instanceof Response) {
			// FIXME: We should be handling this somewhat gracefully
			throw new Error('NOT IMPLEMENTED: Unexpected response from origin')
		}

		packageInfos.push.apply(packageInfos, currentTaskResult.packageInfos)
		if (!currentTaskResult.nextLink) {
			// We've reached the end of results, bail out. Otherwise we start again and queue a new readahead task
			// The remaining tasks will just resolve off into the ether and be ignored
			noMoreNextLinkFound = true
		}
	}

	return packageInfos
}

/** Returns the NextLink of a function, if present */
function getNextLink(xml: any): URL | undefined {
	const links: any[] = Array.isArray(xml.feed.link) ? xml.feed.link : [xml.feed.link]
	const link = links.find((link: any) => link['@_rel'] === 'next')
	return link ? new URL(link['@_href']) : undefined
}

function parseNugetV2DependencyString(pageBase: URL, nugetV2depInfo: string) {
	const deps = nugetV2depInfo.split('|')
	return deps.map<Dependency>(dep => {
		const [id, v2Range] = dep.split(':')

		// For PS and Nuget v2, a specified version actually means a minimum version, we need to fix that here
		const range = v2Range.match(/^\d.+/) ? `[${v2Range}, )` : v2Range

		// We can find the registration base by removing the package from the page base
		const registrationBase = new URL(pageBase.toString().substring(0, pageBase.toString().lastIndexOf('/')))

		const dependencyIndexId = urlJoin(registrationBase, id, 'index.json')
		return {
			id: id,
			range: range,
			registration: dependencyIndexId,
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

	const majorOnly = /^\d+$/
	const majorMinorOnly = /^\d+\.\d+$/
	if (majorOnly.test(version)) {
		version = `${version}.0.0`
	} else if (majorMinorOnly.test(version)) {
		version = `${version}.0`
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
		'd:Version': string
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
export class Index {
	'@id': URL
	/** How many pages exist in the index. This should typically not be more than 4 for our bridge */
	count: number
	items: Page[]

	constructor(
		/** The base path for the registration endpoint, as defined in the main index service */
		registrationBaseUrl: URL | string,
		/** The name of the registration (usually the package name) */
		name: string,
		v2Infos: NugetV2PackageInfo[],
		// Create a fake "page" referencing all versions not found in the nuget v2 response. We use this as a way to quickly response without having to look up all the other versions if this package has more than the default page size of the server.
		olderVersions = true
	) {
		this['@id'] = new URL(urlJoin(registrationBaseUrl, name, 'index.json'))
		// Converts string to a URL if present to make the type consistent
		registrationBaseUrl = new URL(registrationBaseUrl)
		const indexBase = urlJoin(registrationBaseUrl, name)
		// Append index.json to indexBase preserving the full path of indexBase

		this.items = []
		// We are going to splice this and dont want to mess with the original array
		const myv2Infos = Array.from(v2Infos)

		const latest = myv2Infos.find(v2Info => v2Info['m:properties']['d:IsLatestVersion']?.__value)
		if (latest) {
			// TODO: Handle case where the latest version is hidden. Right now it just goes into otherversions
			this.items.push(new Page(indexBase, [latest], this['@id'], 'latest'))
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
		const latestPrerelease = myv2Infos.find(v2Info => v2Info['m:properties']['d:IsAbsoluteLatestVersion']?.__value)
		if (latestPrerelease) {
			this.items.push(new Page(indexBase, [latestPrerelease], this['@id'], 'prerelease'))
			const removedItem = myv2Infos.splice(myv2Infos.indexOf(latestPrerelease), 1)
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
			this.items.push(new Page(indexBase, myv2Infos, this['@id'], 'other'))
		}

		if (olderVersions) {
			const lowestVersion = minSatisfying(
				this.items.map(p => p.lower),
				'*'
			)
			if (!lowestVersion) {
				throw new Error('No lowest version found. This is a bug and should not happen')
			}
			// This doesnt actually exist yet, but will be fast-cached by a background task after the index is returned
			const olderPageStub: Page = {
				'@id': urlJoin(indexBase, 'page/older.json'),
				lower: '0.0.0',
				upper: lowestVersion,
				count: 0,
			}
			this.items.push(olderPageStub)
		}

		this.count = this.items.length
	}

	// Takes pages that have more than 1 item, cache them, and replace them with a stub
	async compress() {
		var cache = await caches.open('pwshgallery')
		for (const page of this.items) {
			if (page.items && page.items.length > 1) {
				// Replace the page anchor with a direct link
				page.parent = new URL(page['@id'].toString().replace(/index\.json#.+$/, 'index.json'))
				page['@id'] = new URL(page['@id'].toString().replace(/index\.json#(page\/.+?)$/, '$1.json'))
				// Publish the full page with the direct link ID to the cache so future direct requests will pick it up
				console.debug('Caching page %s', page['@id'].toString())
				await cache.put(
					page['@id'].toString(),
					new Response(toJSON(page), {
						headers: {
							'Cache-Control': 'max-age=86400',
						},
					})
				)
				// Empty the items and parent to indicate it is a stub
				page.parent = undefined
				page.items = undefined
			}
		}
		return this
	}
}

/**
 * Nuget v3 Registration Page
 * https://learn.microsoft.com/en-us/nuget/api/registration-base-url-resource#registration-pages-and-leaves
 */
export class Page {
	'@id': URL
	lower: string
	upper: string
	count: number
	parent?: URL
	items?: Leaf[]
	constructor(
		/** Represents the base path that the page and related Leaf IDs will be constructed from. Usually the base path of the index without the index.json e.g. https://myserver/packages/MyPackage/ */
		pageBase: URL,
		packages: NugetV2PackageInfo[],
		parentIndexId: URL,
		pageName?: string
	) {
		const leaves = packages.map(p => new Leaf(pageBase, p))

		const versionMap = new Map<SemVer, string>()

		// Maps the semver we use for comparison to the "actual" version from the Nuget v2 API
		const versions: SemVer[] = leaves.map(leaf => {
			const nugetV2Version = leaf.catalogEntry.version
			const semVer: SemVer =
				parseNugetV2Version(nugetV2Version) ??
				throwIfNull(`version ${nugetV2Version} could not be parsed. This should never happen.`)
			versionMap.set(semVer, nugetV2Version)
			return semVer
		})

		this.count = leaves.length
		this.items = leaves
		const lowerSemVer: SemVer =
			minSatisfying(versions, '*', { includePrerelease: true }) ??
			throwIfNull('no lower bound found. This should never happen.')

		this.lower = versionMap.get(lowerSemVer) ?? throwIfNull('lower bound version not found in the map. This is a bug.')

		const upperSemVer: SemVer =
			maxSatisfying(versions, '*', { includePrerelease: true }) ??
			throwIfNull('no lower bound found. This should never happen.')
		this.upper = versionMap.get(upperSemVer) ?? throwIfNull('upper bound version not found in the map. This is a bug.')

		// If no named page was specified, make an automatic one from the upper and lower bounds
		const pageBaseName = 'page/' + pageName ?? this.lower + '/' + this.upper

		// We want inlined links to be an anchor to the index rather than a separate link so clients dont try to follow it.
		// this is better for caching.
		this['@id'] = urlJoin(parentIndexId, '#' + pageBaseName)
	}
}

export class Leaf {
	'@id': URL
	catalogEntry: CatalogEntry
	/** The URL to download the .nupkg file */
	packageContent: string
	// Creates a leaf and all related child items from a NugetV2 Package
	constructor(pageBase: URL, packageInfo: NugetV2PackageInfo) {
		// NOTE: While we use a normalized version for purposes of sorting, we use the original version for the catalogEntry
		const nugetV2Version = packageInfo['m:properties']['d:Version']

		this['@id'] = urlJoin(pageBase, nugetV2Version + '.json')
		this.packageContent = packageInfo.content['@_src']

		this.catalogEntry = {
			// We use an anchor because its an inlined entry
			'@id': new URL(this['@id'] + '#catalogEntry'),
			id: packageInfo.title.__value,
			version: nugetV2Version,
		}

		const dependencies = packageInfo['m:properties']['d:Dependencies']
		this.catalogEntry.dependencyGroups = dependencies ? [new DependencyGroup(pageBase, dependencies)] : []
	}
}

interface CatalogEntry {
	'@id': URL
	id: string
	version: string
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
	constructor(PageBase: URL, nugetV2depInfo: string) {
		this.dependencies = parseNugetV2DependencyString(PageBase, nugetV2depInfo)
	}
	targetFramework?: string
	dependencies?: Dependency[]
}

interface Dependency {
	id: string
	range?: string
	registration?: URL
}

function newBadRequest(message: string) {
	return new Response(message, {
		status: StatusCodes.BAD_REQUEST,
	})
}
