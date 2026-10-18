import { describe, it } from "@effect/vitest"
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
import { managedResources } from "../src/store.ts"
import { update } from "../src/update.ts"
import { view } from "../src/view.ts"
import { apiUrl, membership, session, signedOut } from "./fixtures.ts"

describe("the app", () => {
  it("a person signs in, opens a workspace, sees what its replica holds, and signs out", () => {
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
      Subscription.emit(Message.CountedRecords({ counts: { Workspace: 1, Member: 2 } })),
      expect(text("Member")).toExist(),
      expect(text("2")).toExist(),
      click(role("button", { name: "Sign out" })),
      Command.resolve(SignOut, Message.CompletedSignOut()),
      expect(role("button", { name: "Send a code" })).toExist()
    )
  })
})
