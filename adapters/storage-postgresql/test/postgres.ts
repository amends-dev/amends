import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"

/**
 * Where tests find PostgreSQL. AMENDS_POSTGRES_URL names a running server the
 * tests may create databases on. Without it, a throwaway cluster starts from a
 * local installation, found on PATH or in the usual Homebrew and Debian
 * locations, and stops when the tests end. Without either, the tests skip.
 */
export interface Server {
  /** A maintenance connection URL; each test creates its own database beside it. */
  readonly url: string
  readonly stop: () => Promise<void>
}

const binaryDirectories = async (): Promise<ReadonlyArray<string>> => {
  const found: Array<string> = []
  const onPath = Bun.which("pg_ctl")
  if (onPath !== null) found.push(join(onPath, ".."))
  for (const prefix of ["/opt/homebrew/opt", "/usr/local/opt", "/usr/lib/postgresql"]) {
    const entries = await readdir(prefix).catch(() => [])
    for (const entry of entries
      .filter((name) => /^postgresql|^\d+$/.test(name))
      .sort()
      .reverse())
      found.push(join(prefix, entry, "bin"))
  }
  return found
}

const run = async (command: ReadonlyArray<string>): Promise<void> => {
  const child = Bun.spawn([...command], { stdout: "pipe", stderr: "pipe" })
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  if (code !== 0) throw new Error(`${command.join(" ")} exited with ${code}: ${stderr}`)
}

const startCluster = async (bin: string): Promise<Server> => {
  const directory = await mkdtemp(join(tmpdir(), "amends-pg-"))
  const data = join(directory, "data")
  const port = 40_000 + (process.pid % 20_000)
  await run([join(bin, "initdb"), "-D", data, "-U", "postgres", "-A", "trust", "--no-sync", "-E", "UTF8"])
  // Sockets only, in our own directory: no port to collide with and nothing to clean up elsewhere.
  const options = [
    `-c listen_addresses=''`,
    `-c unix_socket_directories='${directory}'`,
    `-c port=${port}`,
    "-c fsync=off",
    "-c synchronous_commit=off",
    "-c full_page_writes=off"
  ].join(" ")
  await run([join(bin, "pg_ctl"), "-D", data, "-o", options, "-l", join(directory, "log"), "-w", "start"])
  return {
    // The socket directory in the query overrides the placeholder host.
    url: `postgres://postgres@localhost/postgres?host=${encodeURIComponent(directory)}&port=${port}`,
    stop: async () => {
      await run([join(bin, "pg_ctl"), "-D", data, "-m", "immediate", "-w", "stop"]).catch(() => {})
      await rm(directory, { recursive: true, force: true })
    }
  }
}

export const acquire = async (): Promise<Server | undefined> => {
  const configured = process.env.AMENDS_POSTGRES_URL
  if (configured !== undefined && configured !== "") return { url: configured, stop: async () => {} }
  for (const bin of await binaryDirectories()) {
    if (await Bun.file(join(bin, "pg_ctl")).exists()) return startCluster(bin)
  }
  return undefined
}

/** Fresh database per test, created on the server and dropped afterwards, with its connection URL. */
export const database = Effect.fnUntraced(function* (serverUrl: string) {
  const name = `amends_test_${crypto.randomUUID().replaceAll("-", "")}`
  const maintenance = PgClient.layer({ url: Redacted.make(serverUrl), maxConnections: 1 })
  const control = (statement: string) =>
    Effect.flatMap(PgClient.PgClient, (sql) => sql.unsafe(statement)).pipe(Effect.scoped, Effect.provide(maintenance))
  // Setup failures are defects, never one of the test's own typed failures.
  yield* Effect.acquireRelease(control(`CREATE DATABASE "${name}"`).pipe(Effect.orDie), () =>
    control(`DROP DATABASE "${name}" WITH (FORCE)`).pipe(Effect.orDie)
  )
  const url = new URL(serverUrl)
  url.pathname = `/${name}`
  return url.toString()
})

export const temporary = Effect.fnUntraced(function* <A, E, R>(
  serverUrl: string,
  use: (url: string) => Effect.Effect<A, E, R>
) {
  return yield* use(yield* database(serverUrl))
}, Effect.scoped)
