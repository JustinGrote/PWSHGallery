/** A custom formatted request from Itty that also includes parsed params from routes and queries */
export interface IttyRequest extends Request {
	// The parsed params from the route or query string. For example, if the route is /:id/page/:page, then the params will be {id: '123', page: '1'}
	params: { [key: string]: string }
}
