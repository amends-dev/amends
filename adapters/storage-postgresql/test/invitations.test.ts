import { BuiltinRoles } from "@amends-dev/core/authorization"
import { Invitation } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Option } from "effect"
import { bob, inDatabase, initialized, setup, views, workspaceId } from "./support.ts"

const { available, withDatabase } = setup()
describe.skipIf(!available)("PostgreSQL", () => {
  it.effect("a refused statement aborts the transaction even when the program ignores it", () =>
    withDatabase((url) =>
      inDatabase(
        url,
        Effect.gen(function* () {
          const bound = yield* (yield* views()).forWorkspace(workspaceId)
          const workspace = yield* initialized(bound)
          const issuedAt = yield* DateTime.now
          const pending = (id: string): Invitation.Invitation => ({
            details: {
              id: Invitation.InvitationId.make(id),
              workspaceId,
              recipientId: bob.id,
              recipientEmail: "bob@example.com",
              inviterMemberId: workspace.ownerMemberId,
              issuedAt,
              expiresAt: DateTime.add(issuedAt, { hours: 1 }),
              roleId: BuiltinRoles.MemberId
            },
            state: { _tag: "Pending" }
          })
          yield* bound.store.transaction(bound.invitations.insert(pending("first")))
          // PostgreSQL answers COMMIT with a rollback after a refused statement; the store must
          // not report that as success.
          expect(
            yield* Effect.flip(
              bound.store.transaction(
                Effect.gen(function* () {
                  yield* Effect.ignore(bound.invitations.insert(pending("first")))
                  yield* bound.invitations.insert(pending("second")).pipe(Effect.ignore)
                })
              )
            )
          ).toMatchObject({
            _tag: "StoreError",
            store: "Store",
            operation: "commit",
            reason: { _tag: "Failed" }
          })
          expect(yield* bound.invitations.get(Invitation.InvitationId.make("second"))).toEqual(Option.none())
        })
      )
    )
  )
})
