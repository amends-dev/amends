import { GroupId } from "@amends-dev/core/group"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import {
  Command,
  Subscription,
  click,
  expect,
  expectOutMessage,
  given,
  label,
  role,
  scene,
  text,
  type,
  withViewInputs
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { bob, membership, scout } from "../../../test/fixtures.ts"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerBlock } from "../composer/block.ts"
import { SaveDraft } from "../composer/command.ts"
import { UnsentConversationBlock } from "./block.ts"
import { StartConversation } from "./command.ts"
import { Message, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { member } = membership
const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const bobId = MemberId.MemberId.make("member-2")
const scoutId = MemberId.MemberId.make("member-3")

const sceneView = withViewInputs(view, { workspaceName: "Studio" })()

/** The conversation with Bob not started, with the workspace's members read. */
const withBob = modifyFields(init(workspaceId, memberId, [bobId], []).model, { members: () => [member, bob, scout] })

/** The same with Bob and Scout. */
const withBobAndScout = modifyFields(init(workspaceId, memberId, [bobId, scoutId], []).model, {
  members: () => [member, bob, scout]
})

const place = Drafts.Place.cases.Conversation.make({ memberIds: [bobId] })

describe("a conversation not started", () => {
  it("is titled by the person it is with, welcomes the person to it, and asks for the first message", () => {
    scene(
      { update, view: sceneView },
      given(withBob),
      expect(role("heading", { name: "Bob", level: 1 })).toExist(),
      expect(role("heading", { name: "Your conversation with Bob", level: 2 })).toExist(),
      expect(text("Send the first message to start the conversation.")).toExist(),
      expect(label("Message Bob")).toHaveAttr("placeholder", "Message Bob"),
      expect(role("button", { name: "Send" })).toExist(),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("is titled by every person it is with, and its composer is named for them", () => {
    scene(
      { update, view: sceneView },
      given(withBobAndScout),
      expect(role("heading", { name: "Bob, Scout", level: 1 })).toExist(),
      expect(role("heading", { name: "Your conversation with Bob, Scout", level: 2 })).toExist(),
      expect(label("Message Bob, Scout")).toHaveAttr("placeholder", "Message Bob, Scout")
    )
  })

  it("is named by their IDs until the members are read, and by their names once they are", () => {
    scene(
      { update, view: sceneView, subscriptions: UnsentConversationBlock.subscriptions },
      given(init(workspaceId, memberId, [bobId], []).model),
      expect(role("heading", { name: "member-2", level: 1 })).toExist(),
      Subscription.emit(subscriptions.people, Message.ReceivedMembers({ members: [member, bob] })),
      expect(role("heading", { name: "Bob", level: 1 })).toExist(),
      expect(label("Message Bob")).toExist()
    )
  })

  it("starts the conversation from the composer with the first message, and writes nothing before", () => {
    scene(
      { update, view: sceneView },
      given(withBob),
      Command.expectNone(),
      type(label("Message Bob"), "Got a minute?"),
      Command.expectExact(SaveDraft({ workspaceId, memberId, place, text: "Got a minute?" })),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      click(role("button", { name: "Send" })),
      Command.expectExact(
        SaveDraft({ workspaceId, memberId, place, text: "" }),
        StartConversation({ workspaceId, memberId, memberIds: [bobId], text: "Got a minute?" })
      ),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(StartConversation, Message.WroteAction()),
      expect(label("Message Bob")).toHaveValue("")
    )
  })

  it("says why the first message could not be kept", () => {
    scene(
      { update, view: sceneView },
      given(withBob),
      type(label("Message Bob"), "Got a minute?"),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      click(role("button", { name: "Send" })),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(
        StartConversation,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      expect(role("alert")).toHaveText("This browser could not keep that. Try again.")
    )
  })

  it("reports the conversation when the store lists one with exactly these people", () => {
    const found = GroupId.GroupId.make("direct-1")

    scene(
      { update, view: sceneView, subscriptions: UnsentConversationBlock.subscriptions },
      given(withBob),
      Subscription.emit(subscriptions.people, Message.ReceivedConversation({ groupId: Option.none() })),
      Subscription.emit(subscriptions.people, Message.ReceivedConversation({ groupId: Option.some(found) })),
      expectOutMessage(OutMessage.FoundConversation({ groupId: found }))
    )
  })
})
