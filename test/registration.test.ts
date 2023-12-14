import { type UnstableDevWorker, unstable_dev as wranglerDev } from 'wrangler'
import { describe, expect, it, test, beforeAll, afterAll } from 'vitest'
import { Page, type Index } from '../src/registration.js'
import { rm } from 'fs/promises'

let base: string
let worker: UnstableDevWorker
// Makes a request either to the test workerd (if in CI) or to wrangler dev
async function request(url: string) {
	if (!base) {
		try {
			const wranglerDevIPv4 = 'http://127.0.0.1:8787'
			await fetch(wranglerDevIPv4) //Will throw if worker dev is not running. We don't use "localhost" because it usually resolves to IPv6 which wrangler dev does not bind to.
			base = wranglerDevIPv4
		} catch (e) {
			console.log('⬆️ Wrangler Dev not running, starting temporary workerd for tests')
			worker = await wranglerDev('src/worker.ts', {
				inspect: true,
				// inspectorPort: 39929, // FIXME: This is not working - https://github.com/cloudflare/workers-sdk/issues/2453#issuecomment-1763200145
				experimental: {
					disableExperimentalWarning: true,
				},
			})
			base = 'http://' + worker.address + ':' + worker.port
		}
	}

	return fetch(new URL(url, base))
}

beforeAll(async () => {
	// Clean up cache
	try {
		await rm('.wrangler/state/v3/cache', { recursive: true })
	} catch (err) {
		// Ignore if the cache directory doesn't exist
		if (err.code !== 'ENOENT') throw err
	}
})
afterAll(async () => {
	if (worker) await worker.stop()
	await rm('.wrangler/tmp', { recursive: true })
})

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
		let response: Response, result: Index
		beforeAll(async () => {
			response = await request('ImportExcel/index.json')
			result = (await response.json()) as Index
		})
		it('responds successfully', () => {
			expect(response.status).toBe(200)
		})
		it('has an id that matches the request', () => {
			expect(result['@id']).toBe(new URL('ImportExcel/index.json', base).toString())
		})
		it('has a latest page inlined', () => {
			expect(result.items[0]['@id']).toBe(new URL('ImportExcel/index.json#page/latest', base).toString())
		})
		it('has a recent page as the next link', () => {
			expect(result.items[1]['@id']).toBe(new URL('ImportExcel/page/recent.json', base).toString())
		})
		it('has a older page as the final link', () => {
			expect(result.items[2]['@id']).toBe(new URL('ImportExcel/page/older.json', base).toString())
		})
		it('lists the prerelease in the PrereleaseTest package', async () => {
			response = await request('PrereleaseTest/index.json')
			result = (await response.json()) as Index
			expect(result.items[0]['@id']).toMatch(/prerelease/)
			expect(result.items[1]['@id']).toMatch(/latest/)
		})

		// it.todo('index page is cached 🚩needs new way to test for wrangler v3', async () => {
		// 	const key = new URL('ImportExcel/index.json', base)
		// 	const cacheResult = await cache.match(key)
		// 	const response = (await cacheResult?.json()) as Index
		// 	expect(response.items[0]['@id']).toMatch(/latest/)
		// 	expect(response.items[0].items?.length).toBe(1)
		// })

		// This is hard to test because we need to figure out how to await on the the waitUtil for the index to complete so the page is cached.
		// describe.todo('RegistrationPage', async () => {
		// 	let url: URL, response: Response, result: Index
		// 	beforeAll(async () => {
		// 		// response = await router.request('/ImportExcel/page.other.json')
		// 		// result = (await response.json()) as Index
		// 	})
		// 	it('responds successfully', () => {
		// 		expect(response.status).toBe(200)
		// 	})
		// 	it('has an id that matches the request', () => {
		// 		expect(result['@id']).toBe(url.toString())
		// 	})
		// })
	})

	describe('RegistrationPageHandler', () => {
		it('Handles an unexpected deep-link to recent', async () => {
			const response = await request('Az.Accounts/page/recent.json')
			const actual = (await response.json()) as Page

			expect(response.status).toBe(200)
			expect(actual['@id']).toBe(new URL('Az.Accounts/page/recent.json', base).toString())
			expect(actual.items?.length).toBeGreaterThan(0)
		})

		it('Handles an unexpected deep-link to older', async () => {
			const response = await request('PnP.PowerShell/page/older.json')
			const actual = (await response.json()) as Page

			expect(response.status).toBe(200)
			expect(actual['@id']).toBe(new URL('PnP.PowerShell/page/older.json', base).toString())
			expect(actual.items?.length).toBeGreaterThan(0)
		}, 10000)
	})
})
