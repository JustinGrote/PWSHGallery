/** Throw wrapped in an expression. Useful for property assignment null conditionals since Typescript doesnt support throw here.
 * @param message The message to add to the
 * @param TResult The type of the result to "fake" as a return, to satisfy type checking
 */
export function throwIfNull<TResult = any>(message: string): TResult {
	throw new TypeError(message)
}

/** Removes nulls, useful in filter */
export const removeNulls = <S>(value: S | undefined): value is S =>
	value != null
