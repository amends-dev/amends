import { Effect } from "effect"

/**
 * Daytona's API at a URL of this process, which answers every request with `status`, and a request
 * to list sandboxes with none when that is 200, or answers nothing. It keeps the path and
 * `Authorization` header of each request it receives, and `requested` settles at the first.
 */
export const serveDaytona = (status: number | "nothing") =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const received: Array<{ readonly path: string; readonly authorization: string | null }> = []
      const { promise: requested, resolve } = Promise.withResolvers<void>()
      const server = Bun.serve({
        port: 0,
        fetch: (request) => {
          received.push({
            path: new URL(request.url).pathname,
            authorization: request.headers.get("authorization")
          })
          resolve()
          if (status === "nothing") return new Promise<Response>(() => {})
          return status === 200
            ? Response.json({ items: [], nextCursor: null })
            : Response.json({ statusCode: status, message: `Answered ${status}` }, { status })
        }
      })
      return { apiUrl: `http://127.0.0.1:${server.port}/api`, received, requested, server }
    }),
    ({ server }) => Effect.promise(() => server.stop(true))
  )
