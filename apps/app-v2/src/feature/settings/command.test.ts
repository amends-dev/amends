import { BuiltinRoles } from "@amends-dev/core/authorization"
import * as Clipboard from "@effect/platform-browser/Clipboard"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer } from "effect"
import { TestClock } from "effect/testing"
import { bob, bobIsMember, membership } from "../../../test/fixtures.ts"
import { recordingStores } from "../../../test/recordingStores.ts"
import { ChangeRole, CopyWorkspaceId, ExpireCopied, RenameSelf, RenameWorkspace } from "./command.ts"
import { Message, Written } from "./definition.ts"

const { workspace, member } = membership
const asMember = { workspaceId: workspace.id, memberId: member.id }

/** A clipboard that keeps the text written to it, or refuses it, as `isRefusing` says. */
const clipboardKeeping = (isRefusing: boolean) => {
  const kept: Array<string> = []
  const clipboard = Clipboard.make({
    read: Effect.die("not read"),
    write: () => Effect.die("not written"),
    readString: Effect.die("not read"),
    writeString: (text) =>
      isRefusing
        ? Effect.fail(new Clipboard.ClipboardError({ message: "Refused", cause: undefined }))
        : Effect.sync(() => {
            kept.push(text)
          })
  })

  return { kept, layer: Layer.succeed(Clipboard.Clipboard, clipboard) }
}

describe("RenameWorkspace", () => {
  it.effect("writes the rename with the name the person saw, and reports that the store kept it", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()
      const message = yield* RenameWorkspace({ ...asMember, name: "Atelier", expectedName: "Studio" }).effect.pipe(
        Effect.provide(Layer.provide(RenameWorkspace.layer, layer))
      )

      expect(written).toEqual([{ action: "WorkspaceRenamed", payload: { name: "Atelier", expectedName: "Studio" } }])
      expect(message).toEqual(Message.WroteAction({ written: Written.Rename() }))
    })
  )

  it.effect("writes nothing for a name that can't be one, and says so", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()
      const message = yield* RenameWorkspace({ ...asMember, name: "   ", expectedName: "Studio" }).effect.pipe(
        Effect.provide(Layer.provide(RenameWorkspace.layer, layer))
      )

      expect(written).toEqual([])
      expect(message).toEqual(Message.FailedWriteAction({ written: Written.Rename(), reason: "Invalid" }))
    })
  )
})

describe("RenameSelf", () => {
  it.effect("writes the person's new name, and reports that the store kept it", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()
      const message = yield* RenameSelf({ ...asMember, name: "Alice M." }).effect.pipe(
        Effect.provide(Layer.provide(RenameSelf.layer, layer))
      )

      expect(written).toEqual([{ action: "MemberRenamed", payload: { name: "Alice M." } }])
      expect(message).toEqual(Message.WroteAction({ written: Written.RenameSelf() }))
    })
  )

  it.effect("writes nothing for a name that can't be one, and says so", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()
      const message = yield* RenameSelf({ ...asMember, name: "" }).effect.pipe(
        Effect.provide(Layer.provide(RenameSelf.layer, layer))
      )

      expect(written).toEqual([])
      expect(message).toEqual(Message.FailedWriteAction({ written: Written.RenameSelf(), reason: "Invalid" }))
    })
  )
})

describe("ChangeRole", () => {
  it.effect("writes the replacement of the roles the person saw, and says which member it was for", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()
      const message = yield* ChangeRole({
        ...asMember,
        changeMemberId: bob.id,
        roleId: BuiltinRoles.AdministratorId,
        expectedAssignmentIds: [bobIsMember.id]
      }).effect.pipe(Effect.provide(Layer.provide(ChangeRole.layer, layer)))

      expect(written).toEqual([
        {
          action: "RolesReplaced",
          payload: { memberId: bob.id, roleId: BuiltinRoles.AdministratorId, expectedAssignmentIds: [bobIsMember.id] }
        }
      ])
      expect(message).toEqual(Message.WroteAction({ written: Written.ChangeRole({ memberId: bob.id }) }))
    })
  )
})

describe("CopyWorkspaceId", () => {
  it.effect("puts the workspace's ID on the clipboard, and reports which copy it was", () =>
    Effect.gen(function* () {
      const { kept, layer } = clipboardKeeping(false)
      const message = yield* CopyWorkspaceId({ workspaceId: workspace.id, attempt: 3 }).effect.pipe(
        Effect.provide(Layer.provide(CopyWorkspaceId.layer, layer))
      )

      expect(kept).toEqual([workspace.id])
      expect(message).toEqual(Message.CopiedWorkspaceId({ attempt: 3 }))
    })
  )

  it.effect("says so when the browser refuses the clipboard", () =>
    Effect.gen(function* () {
      const { kept, layer } = clipboardKeeping(true)
      const message = yield* CopyWorkspaceId({ workspaceId: workspace.id, attempt: 1 }).effect.pipe(
        Effect.provide(Layer.provide(CopyWorkspaceId.layer, layer))
      )

      expect(kept).toEqual([])
      expect(message).toEqual(Message.FailedCopyWorkspaceId())
    })
  )
})

describe("ExpireCopied", () => {
  it.effect("reports that the copy had its time once two seconds have passed, and not before", () =>
    Effect.gen(function* () {
      const expiry = yield* Effect.forkChild(
        ExpireCopied({ attempt: 2 }).effect.pipe(Effect.provide(ExpireCopied.layer))
      )

      yield* TestClock.adjust("1 second")
      expect(expiry.pollUnsafe()).toBeUndefined()

      yield* TestClock.adjust("1 second")
      expect(yield* Fiber.join(expiry)).toEqual(Message.ExpiredCopied({ attempt: 2 }))
    })
  )
})
