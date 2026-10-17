/**
 * The integrations of the sandbox providers this host runs, which workspaces connect to: this
 * machine's sandboxes, under a directory the host gives, since a workspace cannot say where on the
 * host's disk its sandboxes go; and those of Daytona organizations. `LocalHost.makeIntegrations`
 * installs both.
 *
 * @since 0.1.0
 */

import { Connection, Integration } from "@amends-dev/connection"
import { Sandbox } from "@amends-dev/sandbox"
import { DaytonaSandboxProvider } from "@amends-dev/sandbox-daytona"
import { LocalSandboxProvider } from "@amends-dev/sandbox-local"
import { Daytona, type DaytonaConfig, DaytonaError } from "@daytona/sdk"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import type * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import type * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"

/**
 * What the host installs this machine's sandboxes with.
 *
 * @category options
 * @since 0.1.0
 */
export interface LocalOptions {
  /** The directory that holds one directory per connection, which holds its sandboxes. */
  readonly directory: string
}

/** Whether a connection's id can name the directory of the connection's sandboxes. */
const isDirectoryName = (id: string): boolean => Schema.is(Schema.String.check(Sandbox.isName))(id)

/**
 * The integration of this machine's sandboxes. A connection to it gives no settings and no
 * credential, and keeps its sandboxes in a directory of its own, named by its id, so that it never
 * resumes another's. Checking a connection makes that directory.
 *
 * @category constructors
 * @since 0.1.0
 */
export const local = Effect.fn("SandboxIntegrations.local")(function* (options: LocalOptions) {
  const context = yield* Effect.context<
    FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
  >()
  const path = yield* Path.Path

  /** The provider of the sandboxes of `connection`. */
  const sandboxProviderOf = ({ connection }: Integration.Access<unknown, "none">) =>
    Effect.gen(function* () {
      if (!isDirectoryName(connection.id)) {
        return yield* new Connection.InvalidConnectionError({
          description: `The id of ${connection.name}, ${connection.id}, cannot name a directory`
        })
      }
      return yield* LocalSandboxProvider.make({
        directory: path.join(options.directory, connection.id)
      }).pipe(
        Effect.provideContext(context),
        Effect.mapError(
          (error) =>
            new Connection.UnavailableError({
              description: `The sandboxes of ${connection.name} cannot be kept: ${error.message}`
            })
        )
      )
    })

  return Integration.make({
    id: "local",
    name: "This machine",
    auth: ["none"],
    sandboxes: sandboxProviderOf,
    check: (access) =>
      sandboxProviderOf(access).pipe(
        Effect.as<Connection.Health>({ status: "healthy" }),
        Effect.catch((reason) => Effect.succeed(Connection.healthOfReason(reason)))
      )
  })
})

/**
 * The integration of Daytona. A connection to it is an organization, which authenticates with its
 * API key, and may give Daytona's API, when it is not that of Daytona's own cloud, and the region
 * to create sandboxes in. Checking a connection asks Daytona for one of the organization's
 * sandboxes, which it lists only for a valid key, and creates nothing.
 *
 * @category constructors
 * @since 0.1.0
 */
export const daytona = Effect.map(Crypto.Crypto, (crypto) =>
  Integration.make({
    id: "daytona",
    name: "Daytona",
    docs: "https://www.daytona.io/docs",
    settings: Schema.Struct({
      apiUrl: Schema.optionalKey(Schema.NonEmptyString).annotate({
        title: "API URL",
        description: "Daytona's API, when it is not that of Daytona's own cloud."
      }),
      target: Schema.optionalKey(Schema.NonEmptyString).annotate({
        title: "Target",
        description: "The region to create sandboxes in, rather than the organization's."
      })
    }),
    auth: ["apiKey"],
    sandboxes: ({ settings, apiKey }) =>
      DaytonaSandboxProvider.make({ apiKey, ...settings }).pipe(Effect.provideService(Crypto.Crypto, crypto)),
    check: ({ settings, apiKey }) =>
      checkOrganization({ apiKey: Redacted.value(apiKey), ...settings }, settings.apiUrl ?? "Daytona")
  })
)

/**
 * Asks Daytona, reached as `config` says, for one of the organization's sandboxes, which it lists
 * only for a valid key, and says what its answer, or its failing to answer in 15 seconds, says of
 * the connection; `url` names Daytona in what it says.
 */
const checkOrganization = (config: DaytonaConfig, url: string): Effect.Effect<Connection.Health> =>
  Effect.acquireDisposable(Effect.sync(() => new Daytona(config))).pipe(
    Effect.flatMap((daytona) =>
      Effect.tryPromise({
        try: () => daytona.list({ limit: 1 }).next(),
        // Daytona's SDK answers a failure to reach Daytona with no status.
        catch: (error) => (error instanceof DaytonaError ? error.statusCode : undefined)
      })
    ),
    Effect.as<Connection.Health>({ status: "healthy" }),
    Effect.timeout("15 seconds"),
    Effect.catch((failure) =>
      Effect.succeed(typeof failure === "number" ? Connection.healthOfStatus(failure, url) : Connection.unanswered(url))
    ),
    Effect.scoped
  )
