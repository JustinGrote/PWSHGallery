import { unstable_dev as wranglerDev } from 'wrangler'
import type { UnstableDevWorker } from 'wrangler'
import { describe, expect, it, test, beforeAll, afterAll } from 'vitest'
import { type Index, parseNugetV2Version } from '../src/registration.js'
import { readFileSync } from 'fs'
import router from '../src/worker.js'

let base: string
// Makes a request either to the test workerd (if in CI) or to wrangler dev
async function request(url: string) {
	if (!base) {
		try {
			const wranglerDevIPv4 = 'http://127.0.0.1:8787'
			await fetch(wranglerDevIPv4) //Will throw if worker dev is not running. We don't use "localhost" because it usually resolves to IPv6 which wrangler dev does not bind to.
			base = wranglerDevIPv4
		} catch (e) {
			console.log('⬆️ Wrangler Dev not running, starting temporary workerd for tests')
			const worker = await wranglerDev('src/worker.ts', {
				inspect: true,
				inspectorPort: 39929, // FIXME: This is not working - https://github.com/cloudflare/workers-sdk/issues/2453#issuecomment-1763200145
				experimental: {
					disableExperimentalWarning: true,
				},
			})
			base = 'http://' + worker.address + ':' + worker.port
		}
	}

	return fetch(new URL(url, base))
}

describe('router', () => {
	describe('ServiceIndex', () => {
		let response: Response, result: any
		beforeAll(async () => {
			response = await request('index.json')
			result = (await response.json()) as any
		})

		it('responds successfully', () => {
			expect(response.status).toBe(200)
		})

		it('has the correct version', () => {
			expect(result.version).toBe('3.0.0')
		})

		describe('registrationsBaseUrl', () => {
			it('has the correct service indicator', () => {
				expect(result.resources[0]['@type']).toBe('RegistrationsBaseUrl/3.6.0')
			})
			test('id matches the root of the site', () => {
				expect(result.resources[0]['@id']).toBe(base)
			})
		})
	})

	describe('RegistrationIndex', () => {
		let url: URL, response: Response, result: Index, cache: Cache
		beforeAll(async () => {
			response = await request('ImportExcel/index.json')
			result = (await response.json()) as Index
			cache = await caches.open('pwshgallery')
		})
		it('responds successfully', () => {
			expect(response.status).toBe(200)
		})
		it('has an id that matches the request', () => {
			expect(result['@id']).toBe(url.toString())
		})
		it('has a latest page inlined', () => {
			expect(result.items[0]['@id']).toBe(new URL('ImportExcel/index.json#page/latest', base).toString())
		})
		it('has a other page as a link', () => {
			expect(result.items[1]['@id']).toBe(new URL('ImportExcel/page/other.json', base).toString())
		})
		it('has a older page as a link', () => {
			expect(result.items[2]['@id']).toBe(new URL('ImportExcel/page/older.json', base).toString())
		})
		it('index page is cached 🚩needs new way to test for wrangler v3', async () => {
			const key = new URL('ImportExcel/index.json', base)
			const cacheResult = await cache.match(key)
			const response = (await cacheResult?.json()) as Index
			expect(response.items[0]['@id']).toMatch(/latest/)
			expect(response.items[0].items?.length).toBe(1)
		})

		// 		// This is hard to test because we need to figure out how to await on the the waitUtil for the index to complete so the page is cached.
		// 		describe.todo('RegistrationPage', async () => {
		// 			let url: URL, response: Response, result: Index
		// 			beforeAll(async () => {
		// 				response = await router.request('/ImportExcel/page.other.json')
		// 				result = (await response.json()) as Index
		// 			})
		// 			it('responds successfully', () => {
		// 				expect(response.status).toBe(200)
		// 			})
		// 			it('has an id that matches the request', () => {
		// 				expect(result['@id']).toBe(url.toString())
		// 			})
		// 		})
	})
})

// describe('E2E', () => {
// 	let worker: UnstableDevWorker
// 	let base: string

// 	beforeAll(async () => {
// 		worker = await wranglerDev(
// 			'src/worker.ts',
// 			{ inspect: true, inspectorPort: 39929 },
// 			{ disableExperimentalWarning: true }
// 		)
// 		base = 'http://' + worker.address + ':' + worker.port
// 	})

// 	afterAll(async () => {
// 		await worker.stop()
// 	})

// 	describe('ServiceIndex', () => {
// 		let response: Response
// 		let result: any
// 		beforeAll(async () => {
// 			console.log('ok')
// 			response = (await worker.fetch(new URL('index.json', base))) as unknown as Response
// 			result = await response.json()
// 		})

// 		it('returns OK', () => {
// 			expect(response.status).toBe(200)
// 		})

// 		test('version', () => {
// 			expect(result.version).toBe('3.0.0')
// 		})

// 		describe('registrationsBaseUrl', () => {
// 			test('type', () => {
// 				expect(result.resources[0]['@type']).toBe('RegistrationsBaseUrl/3.6.0')
// 			})
// 			test('id', () => {
// 				expect(result.resources[0]['@id']).toBe(base)
// 			})
// 		})
// 	})

// 	describe('RegistrationIndex', () => {
// 		let response: Response
// 		let result: any
// 		let target: URL
// 		beforeAll(async () => {
// 			target = new URL('ImportExcel/index.json', base)
// 			response = (await worker.fetch(target)) as unknown as Response
// 			result = await response.json()
// 		})

// 		it('responds successfully', () => {
// 			expect(response.status).toBe(200)
// 		})
// 		it('has an id that matches the request', () => {
// 			expect(result['@id']).toBe(target.toString())
// 		})
// 		it('has a latest page inlined', () => {
// 			expect(result.items[0]['@id']).toBe(new URL('ImportExcel/index.json#page/latest', base).toString())
// 		})
// 		it('has a other page as a link', () => {
// 			expect(result.items[1]['@id']).toBe(new URL('ImportExcel/page/other.json', base).toString())
// 		})
// 		it('has a older page as a link', () => {
// 			expect(result.items[2]['@id']).toBe(new URL('ImportExcel/page/older.json', base).toString())
// 		})
// 	})
// })

// describe('parseNugetV2Version', () => {
// 	it('parses all known PS Gallery versions', () => {
// 		const allVersions = readFileSync(`${__dirname}/../test/mocks/allPSGalleryVersions.txt`, 'utf8')
// 		const lines = allVersions.split('\n').filter(line => line.length > 0)
// 		lines.forEach(version => {
// 			console.log('version: ' + version)
// 			console.log(parseNugetV2Version(version))
// 			expect(parseNugetV2Version(version)).not.toBeNull()
// 		})
// 	})
// })
