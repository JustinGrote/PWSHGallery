import { Hono } from 'hono'
import { cache } from 'hono/cache'
import { mainIndexHandler } from './mainIndex.js'
import { registrationIndexHandler, registrationPageHandler, registrationPageLeafHandler } from './registration.js'

const router = new Hono()

router.use('*', cache({ cacheName: 'pwshgallery' }))
router.get('/index.json', mainIndexHandler)
router.get('/:id/index.json', registrationIndexHandler)
router.get('/:id/page/:page.json', registrationPageHandler)
// router.get('/:id/:lower/:upper.json', registrationPageLeafHandler)


// 404 for all other requests
router.all('*', () => new Response('Not Found.', { status: 404 }))

export default router

// TODO: Wire up either a scheduled handler or a post-fetch task to check for updated registrations and invalidate the cache if so
