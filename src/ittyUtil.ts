/** A custom formatted request from Itty that also includes parsed params from routes and queries */
export interface IttyRequest extends Request {
	// The parsed params from the route or query string
	params: { [key: string]: string }
}
