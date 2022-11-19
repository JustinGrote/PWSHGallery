/***
 * @abstract Provides useful classes for working with module-based CloudFlare workers
 */
// import { RequestInit } from 'https://unpkg.com/@cloudflare/workers-types@3.18.0/index.d.ts'

// export interface RequestInitCf extends RequestInit {}

/***
 * An example environment, which includes default binding examples. You can extend this class with your own additional environment variables.
 * @see https://denoflare.dev/cli/configuration#bindings
 *
 * To use this example, your .denoflare config file should have a script source binding that looks like this:
 * ```json
 * {
 *   "bindings" {
 *     "kv": { "KVNamespace" : "a3elejowi234oijdsfoiawer234234ojivoia34234" }, //replace this with your own namespace ID
 *     "r2": { "R2Bucket" : "my-bucket" } //replace this with your own bucket name
 *   }
 * }
 * ```
 *
 */
export interface DefaultEnv {
  /**
   * A binding to a [Cloudflare Key Value Namespace](https://developers.cloudflare.com/workers/runtime-apis/kv/). You need to configure your [.denoflare](https://denoflare.dev/cli/configuration#bindings) as follows:
   *
   * ```jsonc
   * {
   *   "bindings": {
   *     "kv": {
   *       "KVNamespace" : "a3elejowi234oijdsfoiawer234234ojivoia34234" //replace this with your own namespace ID
   *     }
   *   }
   * }
   * ```
   */
  kv?: KVNamespace
  r2?: R2Bucket
}

/**
 * The entrypoint to your module-based Cloudflare Worker. This should be your **export default**.
 *
 * @format
 * @see https://blog.cloudflare.com/workers-javascript-modules/
 * @tutorial https://developers.cloudflare.com/workers/get-started/guide/#5-write-code
 * @param {Object} TEnv An object representing your Cloudflare Environment. This is typically a list of environment variables and bindings. Try {@link DefaultEnv} to get started.
 * @example
 * <caption>### Hello World</caption>
 * ```
 * const worker: CFWorker = {
 *  fetch(_request) {
 * 	 return new Response("Hello World!");
 *  }
 * }
 * export default worker
 * // returns "Hello World!"
 * ```
 * @example
 * <caption>### Reply with the name provided by the name query parameter. This is an example of separating the work from the handler</caption>
 *
 * // Define how the fetch should be handled
 * function respondWithName(request: Request) {
 * 	  const url = new URL(request.url);
 * 	  const name = url.searchParams.get("name");
 *   const response = `Hello ${name}!`;
 *   return new Response(response);
 * }
 *
 * const worker: Worker = {
 * 	  //Bind the fetch handler to the worker
 *   fetch: respondWithName,
 * };
 *
 * export default worker;
 *
 * //Returns "Hello Friend!" for http://myworker?name=Friend
 * ```
 *
 */
export interface Worker<TEnv = unknown> {
  /**
   * Called when a request is made to your Worker. You should typically define a function that handles this
   */
  fetch?: WorkerFetchHandler<TEnv>
  /**
   * Called when a scheduled event is triggered. You only need to define this if your cloudflare worker is configured for scheduled runs.
   */
  scheduled?: WorkerScheduledHandler<TEnv>
}

/***
 * The handler for the fetch event.
 */
declare type WorkerFetchHandler<TEnv> = (
  /**
   * The incoming request that triggered this function. It is a typical Request object but also has a special cf property for CF types
   */
  request: IncomingRequestCf,
  /**
   * An object representing your Cloudflare Environment. This is typically a list of environment variables and bindings. Try {@link DefaultEnv} to get started.
   */
  env?: TEnv,
  ctx?: WorkerContextMethods
) => Response | Promise<Response>

declare type WorkerScheduledHandler<TEnv = unknown> = (
  event: ScheduledEvent,
  /**
   * An object representing your Cloudflare Environment. This is typically a list of environment variables and bindings. Try {@link DefaultEnv} to get started.
   */
  env?: TEnv,
  ctx?: WorkerContextMethods
) => void | Promise<void>

/**
 * Contains additional context useful to the operation of the worker.
 */
interface WorkerContextMethods {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

interface ScheduledEvent {
  readonly scheduledTime: number
  readonly cron: string
  noRetry(): void
}

export default Worker
