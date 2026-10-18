import { fileURLToPath } from "node:url"
import { Effect, type Scope } from "effect"

interface Options {
  readonly env?: Readonly<Record<string, string | undefined>>
  /**
   * The line the process writes once it is ready, whose first group says where it serves:
   * `Listening on` and its URL, by default.
   */
  readonly ready?: RegExp
  readonly command?: ReadonlyArray<string>
  readonly startupTimeoutMs?: number
}

/**
 * The real server entry point over a PostgreSQL database, on an ephemeral port, from the line that
 * says it is ready; `close` kills it, as one that fails to start is killed before this rejects.
 */
const start = async (
  databaseUrl: string,
  options: Options
): Promise<Server & { readonly close: () => Promise<void> }> => {
  const env: Record<string, string | undefined> = {
    ...process.env,
    // Development tokens are human IDs, which tests present directly.
    AMENDS_SIGN_IN: "development",
    ...options.env,
    AMENDS_DATABASE_URL: databaseUrl,
    AMENDS_PORT: "0"
  }
  const child = Bun.spawn([...(options.command ?? [process.execPath, "--no-env-file", "hosts/local/src/index.ts"])], {
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe"
  })
  const ready = Promise.withResolvers<string>()
  let output = ""
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let tail = ""
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        const text = decoder.decode(chunk.value, { stream: true })
        output = (output + text).slice(-16_384)
        tail = (tail + text).slice(-16_384)
        const base = (options.ready ?? /Listening on (http:\/\/[^\s]+)(?=\s)/).exec(tail)?.[1]
        if (base !== undefined) ready.resolve(base)
      }
    } finally {
      reader.releaseLock()
    }
  }
  const drains = [drain(child.stdout), drain(child.stderr)]
  for (const draining of drains) void draining.catch(ready.reject)
  const close = async () => {
    child.kill()
    const forceStop = setTimeout(() => child.kill("SIGKILL"), 1_000)
    try {
      await child.exited
      await Promise.allSettled(drains)
    } finally {
      clearTimeout(forceStop)
    }
  }
  const timeout = setTimeout(() => {
    ready.reject(new Error(`Timed out waiting for the server to be ready: ${output}`))
  }, options.startupTimeoutMs ?? 10_000)
  let base: string
  try {
    base = await Promise.race([
      ready.promise,
      child.exited.then(async (code) => {
        await Promise.allSettled(drains)
        throw new Error(`The server exited before it was ready (exit ${code}): ${output}`)
      })
    ])
  } catch (error) {
    await close()
    throw error
  } finally {
    clearTimeout(timeout)
  }
  const call: Call = async (token, method, path, body, workspaceId) => {
    const headers = new Headers({ authorization: `Bearer ${token}` })
    if (workspaceId !== undefined) headers.set("amends-workspace", workspaceId)
    const request: RequestInit = { method, headers }
    if (body !== undefined) {
      headers.set("content-type", "application/json")
      request.body = JSON.stringify(body)
    }
    const response = await fetch(`${base}${path}`, request)
    const text = await response.text()
    return { status: response.status, body: text === "" ? undefined : JSON.parse(text) }
  }
  const stop: Stop = async (signal = "SIGTERM") => {
    const started = performance.now()
    child.kill(signal)
    await child.exited
    return performance.now() - started
  }
  return { base, call, stop, close }
}

/**
 * One lifetime of the real server entry point over a PostgreSQL database, on an ephemeral port,
 * from the line that says it is ready.
 */
export const withServer = async <A>(
  databaseUrl: string,
  run: (call: Call, base: string, stop: Stop) => Promise<A>,
  options: Options = {}
): Promise<A> => {
  const server = await start(databaseUrl, options)
  try {
    return await run(server.call, server.base, server.stop)
  } finally {
    await server.close()
  }
}

/** The real server entry point for as long as the scope lasts, for tests written as Effects. */
export const serving = (databaseUrl: string, options: Options = {}): Effect.Effect<Server, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.promise(() => start(databaseUrl, options)),
    (server) => Effect.promise(() => server.close())
  )

/** A running server: where it serves, a request to it, and stopping it. */
export interface Server {
  readonly base: string
  readonly call: Call
  readonly stop: Stop
}

/**
 * Stop the server as its process manager would, or as a crash does with `SIGKILL`, and say how long
 * it took, in milliseconds.
 */
export type Stop = (signal?: "SIGTERM" | "SIGKILL") => Promise<number>

/**
 * Send a request as the bearer of `token`; one to an endpoint a member calls names the workspace
 * it acts in, `workspaceId`.
 */
export type Call = (
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  workspaceId?: string
) => Promise<{ status: number; body: unknown }>
