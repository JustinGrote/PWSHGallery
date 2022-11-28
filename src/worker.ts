/** @format */

import { Router } from 'itty-router'
import { mainIndexHandler } from './mainIndex'
import {
	registrationIndexHandler,
	registrationPageHandler,
} from './registration'
import { assertModuleFastUserAgent } from './middleware'

const router = Router()

// Enable this in prod
// router.get('*', assertModuleFastUserAgent)
router.get('/index.json', mainIndexHandler)
// This is basically not used
// router.get('/registration/index.json', registrationIndexHandler)
router.get('/:id/index.json', registrationIndexHandler)
router.get('/:id/page/:page', registrationPageHandler)

// router.get('/registration', getRegistrationIndexHandler)

// 404 for all other requests
router.all('*', () => new Response('Not Found.', { status: 404 }))

export default {
	fetch: router.handle,
}

// TODO: Wire up either a scheduled handler or a post-fetch task to check for updated registrations and invalidate the cache if so
