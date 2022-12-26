import { unstable_dev } from 'wrangler'
import type { UnstableDevWorker } from 'wrangler'
import { describe, expect, it, test, beforeAll, afterAll } from 'vitest'
import type { Index, Page, Leaf } from './registration.js'
import { ExecutionContext } from '@cloudflare/workers-types'
import router from './worker'

/** A helper function to easily make GET requests against the hono router with a dummy ExecutionContext */
async function get(url: URL | string, environment?: any, mockContext?: ExecutionContext) {
	const request = new Request(url)
	mockContext ??= {
		passThroughOnException: () => {},
		waitUntil: () => {},
	}
	return await router.fetch(request, environment, mockContext)
}

describe('router', () => {
	const base = 'http://pwsh.gallery'

	describe('ServiceIndex', async () => {
		let url: URL, response: Response, result: any
		beforeAll(async () => {
			url = new URL('index.json', base)
			response = await get(url)
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

	describe('RegistrationIndex', async () => {
		let url: URL, response: Response, result: Index, cache: Cache
		beforeAll(async () => {
			url = new URL('ImportExcel/index.json', base)
			response = await get(url)
			result = await response.json()
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
		it('index page is cached', async () => {
			const key = new URL('ImportExcel/index.json', base)
			const cacheResult = await cache.match(key)
			const response = (await cacheResult.json()) as Index
			expect(response.items[0]['@id']).toMatch(/latest/)
			expect(response.items[0].items.length).toBe(1)
		})

		// This is hard to test because we need to figure out how to await on the the waitUtil for the index to complete so the page is cached.
		describe.todo('RegistrationPage', async () => {
			let url: URL, response: Response, result: Index
			beforeAll(async () => {
				url = new URL('ImportExcel/page/other.json', base)
				response = await get(url)
				result = await response.json()
			})
			it('responds successfully', () => {
				expect(response.status).toBe(200)
			})
			it('has an id that matches the request', () => {
				expect(result['@id']).toBe(url.toString())
			})
		})
	})
})

describe('UnstableDevWorker E2E', () => {
	let worker: UnstableDevWorker
	let base: string

	beforeAll(async () => {
		worker = await unstable_dev(
			'src/worker.ts',
			{ inspect: true, inspectorPort: 39929 },
			{ disableExperimentalWarning: true }
		)
		base = 'http://' + worker.address + ':' + worker.port
	})

	afterAll(async () => {
		await worker.stop()
	})

	describe('ServiceIndex', () => {
		let response: Response
		let result: any
		beforeAll(async () => {
			response = (await worker.fetch(new URL('index.json', base))) as unknown as Response
			result = await response.json()
		})

		it('returns OK', () => {
			expect(response.status).toBe(200)
		})

		test('version', () => {
			expect(result.version).toBe('3.0.0')
		})

		describe('registrationsBaseUrl', () => {
			test('type', () => {
				expect(result.resources[0]['@type']).toBe('RegistrationsBaseUrl/3.6.0')
			})
			test('id', () => {
				expect(result.resources[0]['@id']).toBe(base)
			})
		})
	})

	describe('RegistrationIndex', () => {
		let response: Response
		let result: any
		let target: URL
		beforeAll(async () => {
			target = new URL('ImportExcel/index.json', base)
			response = (await worker.fetch(target)) as unknown as Response
			result = await response.json()
		})

		it('responds successfully', () => {
			expect(response.status).toBe(200)
		})
		it('has an id that matches the request', () => {
			expect(result['@id']).toBe(target.toString())
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
	})
})
