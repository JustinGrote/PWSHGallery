/** @format */

import { Router } from 'itty-router'
import { mainIndexHandler } from './mainIndex'
import {
	registrationIndexHandler,
	registrationPageHandler,
} from './registration'

const router = Router()

router.get('/index.json', mainIndexHandler)
router.get('/:id/index.json', registrationIndexHandler)
router.get('/:id/:page', registrationPageHandler)

// 404 for all other requests
router.all('*', () => new Response('Not Found.', { status: 404 }))

export default {
	fetch: router.handle,
}

// TODO: Wire up either a scheduled handler or a post-fetch task to check for updated registrations and invalidate the cache if so
