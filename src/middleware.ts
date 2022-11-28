import { StatusCodes } from 'http-status-codes'

/** Verifies that the ModuleFast agent is making the request and drops the connection otherwise */
export function assertModuleFastUserAgent(request: Request) {
	const userAgent = request.headers.get('User-Agent')
	if (!userAgent?.startsWith('ModuleFast')) {
		return new Response(
			'Only the ModuleFast user agent is currently supported. Sorry!',
			{ status: StatusCodes.NOT_IMPLEMENTED }
		)
	}
}
