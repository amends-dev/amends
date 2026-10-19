import { GroupId } from "@amends-dev/core/group"
import { ThreadMessage } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Effect, Layer, Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { recordingStores } from "../../../test/recordingStores.ts"
import { CreateTeam, StartConversation } from "./command.ts"
import { DialogBinding } from "./composition.ts"
import { Message, OutMessage, Starting } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const bobId = MemberId.MemberId.make("member-2")
const groupId = GroupId.GroupId.make("general")

const listed = init(workspaceId, memberId).model

/** What the dialog reports, as the groups receive it. */
const fromDialog = (message: typeof DialogBlock.Message.Type) =>
  DialogBinding.embedView({
    slotId: "starting",
    model: listed.dialog,
    viewInputs: { toView: () => null }
  }).toParentMessage(message)

describe("the groups", () => {
  it("start nothing, with the dialog closed, until the person asks", () => {
    story(
      update,
      given(listed),
      model((model) => {
        expect(model.starting).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })

  it("open the dialog on a blank team form, and on a blank conversation form", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedNewTeam()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      model((model) => {
        expect(model.starting).toEqual(Option.some(Starting.Team({ name: "", isPublic: false })))
        expect(model.dialog.isOpen).toBe(true)
      }),
      message(Message.ClickedNewConversation()),
      Command.expectNone(),
      model((model) => {
        expect(model.starting).toEqual(Option.some(Starting.Conversation({ memberId: Option.none(), text: "" })))
        expect(model.dialog.isOpen).toBe(true)
      })
    )
  })

  it("start a team with the name given, public when the person says so, and close the dialog", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedNewTeam()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.TypedTeamName({ name: "Design" })),
      message(Message.ToggledTeamPublic({ isPublic: true })),
      message(Message.SubmittedTeam()),
      Command.expectHas(CreateTeam({ workspaceId, memberId, name: "Design", isPublic: true }), Dialog.test.CloseDialog),
      Command.resolve(CreateTeam, Message.WroteAction()),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.starting).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
        expect(model.notice).toEqual(Option.none())
      })
    )
  })

  it("start a conversation once a member is chosen, with the first message written", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedNewConversation()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.TypedConversationText({ text: "Got a minute?" })),
      message(Message.SubmittedConversation()),
      Command.expectNone(),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
      }),
      message(Message.ChoseConversationMember({ memberId: Option.some(bobId) })),
      message(Message.SubmittedConversation()),
      Command.expectHas(
        StartConversation({ workspaceId, memberId, withMemberId: bobId, text: "Got a minute?" }),
        Dialog.test.CloseDialog
      ),
      Command.resolve(
        StartConversation,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.starting).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
      })
    )
  })

  it.effect("write a conversation with the members its first message mentions", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()
      const start = (text: string) =>
        StartConversation({ workspaceId, memberId, withMemberId: bobId, text }).effect.pipe(
          Effect.provide(Layer.provide(StartConversation.layer, layer))
        )
      const text = `${ThreadMessage.mentionText(bobId, "Bob")} got a minute?`

      yield* start(text)
      yield* start("Got a minute?")

      expect(written).toEqual([
        { action: "DirectThreadStarted", payload: { memberIds: [bobId], text, mentions: [bobId] } },
        { action: "DirectThreadStarted", payload: { memberIds: [bobId], text: "Got a minute?", mentions: [] } }
      ])
    })
  )

  it("drop what the person was starting when the dialog closes, and report the group picked once", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedNewTeam()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.TypedTeamName({ name: "Design" })),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.starting).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      message(Message.ClickedGroup({ groupId })),
      expectOutMessage(OutMessage.SelectedGroup({ groupId })),
      message(Message.ClickedGroup({ groupId })),
      expectNoOutMessage()
    )
  })
})
