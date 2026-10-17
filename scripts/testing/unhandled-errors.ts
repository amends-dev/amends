/**
 * happy-dom's fetch closes a streaming response body again when the aborted connection ends,
 * throwing outside any test. Aborting is how the client closes a change stream, and the portable
 * feature stories run the real client over happy-dom's fetch, so this one error is not a test
 * failure. Every other unhandled error still fails the run.
 */
export const onUnhandledError = (error: { readonly message?: string; readonly stack?: string }): boolean | void => {
  if (
    error.message === "Invalid state: Controller is already closed" &&
    error.stack?.includes("happy-dom") &&
    error.stack.includes("FetchBodyUtility")
  )
    return false
}
