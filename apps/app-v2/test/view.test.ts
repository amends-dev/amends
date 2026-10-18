import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import {
  Command,
  ManagedResource,
  Subscription,
  click,
  expect,
  given,
  label,
  role,
  scene,
  text,
  type
} from "foldkit/scene"
import { CheckCode, LoadWorkspaces, SaveSession, SendCode, SignOut } from "../src/command.ts"
import { Message } from "../src/message.ts"
import { Dismiss, managedResources, PostReply } from "../src/store.ts"
import { update } from "../src/update.ts"
import { view } from "../src/view.ts"
import { apiUrl, general, membership, opening, session, signedOut, thread } from "./fixtures.ts"

describe("the app", () => {
  it("a person signs in, opens a thread, replies, sees what was refused, and signs out", () => {
    scene(
      { update, view },
      given(signedOut),
      type(label("Email"), "alice@example.com"),
      click(role("button", { name: "Send a code" })),
      Command.expectExact(SendCode({ apiUrl, email: "alice@example.com" })),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      expect(text("Enter the code sent to alice@example.com.")).toExist(),
      type(label("Code"), "123456"),
      click(role("button", { name: "Sign in" })),
      Command.resolve(CheckCode, Message.SucceededSignIn({ session })),
      Command.resolve(SaveSession, Message.CompletedSaveSession()),
      expect(text("Loading your workspaces…")).toExist(),
      Command.resolve(LoadWorkspaces, Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      click(role("button", { name: "Studio" })),
      expect(text("Opening…")).toExist(),
      ManagedResource.acquire(managedResources.store),
      Subscription.emit(Message.GotGroups({ groups: [general] })),
      click(role("button", { name: "General" })),
      expect(text("No threads yet.")).toExist(),
      // A thread the person started shows at once, marked as sending.
      Subscription.emit(
        Message.GotThreads({ groupId: general.id, threads: [{ thread, opening: Option.some(opening), pending: true }] })
      ),
      expect(text(" · Sending…")).toExist(),
      click(role("button", { name: "Plans for the week" })),
      Subscription.emit(Message.GotMessages({ threadId: thread.id, messages: [{ message: opening, pending: false }] })),
      expect(text("Plans for the week")).toExist(),
      type(label("Reply"), "Sounds good"),
      click(role("button", { name: "Reply" })),
      Command.expectExact(PostReply({ threadId: thread.id, text: "Sounds good" })),
      Command.resolve(PostReply, Message.WroteAction()),
      // One the server refused says why, until it is dismissed.
      Subscription.emit(
        Message.GotActions({
          actions: [
            {
              key: "refused",
              what: "post a reply",
              text: Option.some("Sounds good"),
              rejection: Option.some("You may not post in this thread")
            }
          ]
        })
      ),
      expect(text("Couldn't post a reply: You may not post in this thread")).toExist(),
      click(role("button", { name: "Dismiss" })),
      Command.resolve(Dismiss, Message.CompletedDismiss()),
      Subscription.emit(Message.GotActions({ actions: [] })),
      expect(text("Couldn't post a reply: You may not post in this thread")).toBeAbsent(),
      click(role("button", { name: "Sign out" })),
      Command.resolve(SignOut, Message.CompletedSignOut()),
      expect(role("button", { name: "Send a code" })).toExist()
    )
  })
})
