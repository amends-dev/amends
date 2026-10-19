import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import { Subscription, click, expect, given, role, scene, text } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { bob, general, membership, notificationOf, opening, reply, thread } from "../../../test/fixtures.ts"
import { InboxBlock } from "../../feature/inbox/block.ts"
import { WorkspaceBlock } from "./block.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership

const opened = init(workspace.id, member.id, workspace.name).model

const workspaceSubscriptions = WorkspaceBlock.subscriptions

/** The inbox read, with a notification of Bob's reply in a thread of general. */
const withNotification = modifyFields(opened, {
  inbox: (inbox) =>
    modifyFields(inbox, {
      items: () => [
        {
          notification: notificationOf("notification-1", 2, 5),
          thread: Option.some(thread),
          opening: Option.some(opening),
          message: Option.some(reply)
        }
      ],
      groups: () => [general],
      members: () => [member, bob]
    })
})

describe("a workspace", () => {
  it("shows how many notifications wait beside the inbox, which it shows on request", () => {
    scene(
      { update, view },
      given(withNotification),
      expect(role("button", { name: "Inbox (1)" })).toExist(),
      expect(role("region", { name: "Inbox" })).toBeAbsent(),
      click(role("button", { name: "Inbox (1)" })),
      expect(role("region", { name: "Inbox" })).toExist(),
      expect(text("Bob: Sounds good · Plans for the week in General")).toExist()
    )
  })

  it("names the inbox alone while nothing waits in it", () => {
    scene(
      { update, view },
      given(opened),
      expect(role("button", { name: "Inbox" })).toExist(),
      click(role("button", { name: "Inbox" })),
      expect(text("Nothing new.")).toExist()
    )
  })

  it("reads the inbox whichever destination it shows", () => {
    scene(
      { update, view, subscriptions: workspaceSubscriptions },
      given(opened),
      expect(role("region", { name: "Inbox" })).toBeAbsent(),
      Subscription.emit(
        workspaceSubscriptions["inbox/inbox"],
        InboxBlock.Message.ReceivedInbox({ items: withNotification.inbox.items })
      ),
      expect(role("button", { name: "Inbox (1)" })).toExist(),
      expect(role("region", { name: "Inbox" })).toBeAbsent()
    )
  })
})
