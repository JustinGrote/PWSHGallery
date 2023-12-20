import { Hono } from 'hono'
import { cache } from 'hono/cache'
import { mainIndexHandler } from './mainIndex.js'
import { type Index, registrationIndexHandler, registrationPageHandler } from './registration.js'

type Environment = {}

const router = new Hono<Environment>()

// TODO: Move this out to its own middlewareHandler like: https://github.com/honojs/hono/blob/0f33cf8d457d246df1324fc6f0e9f8661f7fe4fd/src/middleware/cache/index.ts#L4
// router.use('*', cache({ cacheName: 'pwshgallery' }))
// router.use('*', async (c, next) => {
// 	const cache = await caches.open('pwshgallery')
// 	const url = c.req.url
// 	const match = await cache.match(url)
// 	if (match) {
// 		console.log(`${url}: Frontend Cache HIT!`)
// 		return new Response(match.body, match)
// 	}
// 	console.log(`${url}: Frontend Cache MISS!`)
// 	await next()
// 	// if (!c.res.ok) {
// 	// 	console.log(`${url}: Error Detected, skipping cache!`)
// 	// 	return
// 	// }

// 	// console.log(`${url}: Frontend Cache SAVE!`)
// 	// cache.put(url, c.res.clone())
// 	// return new Response(c.res.body, c.res)
// })
router.get('/index.json', mainIndexHandler)
router.get('/:id/index.json', registrationIndexHandler)
router.get('/:id/page/:page{\\w+\\.json$}', registrationPageHandler)

// router.get('/:id/:lower/:upper.json', registrationPageLeafHandler)

// 404 for all other requests
router.all('*', () => new Response('Not Found.', { status: 404 }))

export default router

// TODO: Wire up either a scheduled handler or a post-fetch task to check for updated registrations and invalidate the cache if so
