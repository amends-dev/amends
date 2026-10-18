import { Identity } from "@amends-dev/core/identity"
import { Accounts, SessionTokens, SyncStorage, WorkspaceDirectory } from "@amends-dev/gateway"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Redacted, Ref } from "effect"
import { HttpClientRequest, HttpServer } from "effect/http"
import { HttpApiMiddleware, HttpApiTest } from "effect/http-api"
import { Api, Authentication, BearerAuthentication, MeHandlers, WorkspaceMember } from "../src/index.ts"

it.effect.each(["make", "layer"] as const)(
  "bearer %s resolves each request and observes token revocation",
  (construction) =>
    Effect.gen(function* () {
      const resolutions: Array<string> = []
      const principals: Array<Identity.MemberReference> = []
      yield* Effect.gen(function* () {
        const token = yield* Ref.make("alice")
        const revoked = yield* Ref.make<ReadonlySet<string>>(new Set())
        const sessionTokens = SessionTokens.SessionTokens.of({
          resolve: Effect.fnUntraced(function* (token) {
            const id = Redacted.value(token)
            resolutions.push(id)
            if ((yield* Ref.get(revoked)).has(id)) return yield* new SessionTokens.Rejected({ reason: "expired" })
            return Identity.Reference.cases.Human.make({ id: Identity.HumanId.make(id) })
          }),
          revoke: (token) => Ref.update(revoked, (ids) => new Set([...ids, Redacted.value(token)]))
        })
        const authentication =
          construction === "make"
            ? Layer.succeed(
                Authentication.Authentication,
                yield* BearerAuthentication.make.pipe(Effect.provideService(SessionTokens.SessionTokens, sessionTokens))
              )
            : BearerAuthentication.layer.pipe(Layer.provide(Layer.succeed(SessionTokens.SessionTokens, sessionTokens)))
        const directory = Layer.succeed(
          WorkspaceDirectory.WorkspaceDirectory,
          WorkspaceDirectory.WorkspaceDirectory.of({
            list: (identity) =>
              Effect.sync(() => {
                principals.push(identity)
                return { memberships: [], invitations: [] }
              })
          })
        )
        const accounts = Layer.succeed(
          Accounts.Accounts,
          Accounts.Accounts.of({
            findOrCreate: () => Effect.die("unused"),
            findByIds: () => Effect.succeed([])
          })
        )
        const syncStorage = Layer.succeed(
          SyncStorage.SyncStorage,
          SyncStorage.SyncStorage.of({
            remoteId: Effect.die("unused"),
            registerKey: () => Effect.die("unused"),
            removeKey: () => Effect.die("unused"),
            personOf: () => Effect.die("unused"),
            bindSigningKey: () => Effect.die("unused")
          })
        )
        const clientAuthentication = HttpApiMiddleware.layerClient(
          Authentication.Authentication,
          Effect.fnUntraced(function* ({ next, request }) {
            return yield* next(HttpClientRequest.bearerToken(request, yield* Ref.get(token)))
          })
        )
        // These requests enter no workspace.
        const workspaceMember = Layer.succeed(
          WorkspaceMember.WorkspaceMember,
          WorkspaceMember.WorkspaceMember.of(() => Effect.die("unused"))
        )
        const services = Layer.mergeAll(
          MeHandlers.layer,
          clientAuthentication,
          WorkspaceMember.layerClientOutsideWorkspace,
          workspaceMember,
          HttpServer.layerServices
        ).pipe(
          Layer.provideMerge(authentication),
          Layer.provide([directory, accounts, syncStorage, Layer.succeed(SessionTokens.SessionTokens, sessionTokens)])
        )
        yield* Effect.gen(function* () {
          const client = yield* HttpApiTest.groups(Api.Api, ["me"])
          expect(resolutions).toEqual([])
          yield* client.me.workspaces()
          yield* Ref.set(token, "bob")
          yield* client.me.workspaces()
          // Signing out revokes the token the request presented, and no other.
          yield* client.me.signOut()
          const rejected = yield* Effect.flip(client.me.workspaces())
          expect(rejected).toMatchObject({
            _tag: "Authentication.Unauthorized",
            message: "The bearer token has expired"
          })
          yield* Ref.set(token, "alice")
          yield* client.me.workspaces()
          expect(yield* Ref.get(revoked)).toEqual(new Set(["bob"]))
          expect(resolutions).toEqual(["alice", "bob", "bob", "bob", "alice"])
          expect(principals).toEqual([
            Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") }),
            Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") }),
            Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") })
          ])
        }).pipe(Effect.provide(services))
      }).pipe(Effect.scoped)
    })
)
