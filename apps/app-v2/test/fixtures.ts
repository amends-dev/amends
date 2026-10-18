import { Group } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { Thread, ThreadMessage } from "@amends-dev/core/thread"
import { Accounts, type SignIn, WorkspaceDirectory } from "@amends-dev/gateway"
import { Option, Schema } from "effect"
import type { Model } from "../src/model.ts"
import { init } from "../src/update.ts"

export const apiUrl = "http://127.0.0.1:8787"

export const session: SignIn.Session = {
  token: "alice",
  account: { id: Identity.HumanId.make("alice"), email: Accounts.Email.make("alice@example.com") }
}

export const membership = Schema.decodeSync(WorkspaceDirectory.Membership)({
  workspace: { id: "workspace-1", name: "Studio", createdBy: "alice", ownerMemberId: "member-1" },
  member: {
    id: "member-1",
    workspaceId: "workspace-1",
    identity: { _tag: "Human", id: "alice" },
    name: "Alice",
    status: "active"
  },
  people: 1
})

/** Signed out, at an empty form. */
export const signedOut: Model = init({ apiUrl, session: Option.none() }).model

/** Signed in as alice, her workspaces not listed yet. */
export const signedIn: Model = init({ apiUrl, session: Option.some(session) }).model

export const general = Schema.decodeSync(Group.Group)({
  id: "general",
  workspaceId: "workspace-1",
  kind: "Team",
  visibility: "Public",
  name: "General",
  createdBy: "member-1",
  createdAt: "2026-10-18T12:00:00Z"
})

export const thread = Schema.decodeSync(Thread.Thread)({
  id: "thread-1",
  workspaceId: "workspace-1",
  groupId: "general",
  title: null,
  origin: null,
  createdBy: { _tag: "Member", memberId: "member-1" },
  createdAt: "2026-10-18T12:00:00Z"
})

export const opening = Schema.decodeSync(ThreadMessage.ThreadMessage)({
  id: "message-1",
  workspaceId: "workspace-1",
  threadId: "thread-1",
  author: { _tag: "Member", memberId: "member-1" },
  via: null,
  publishedAt: "2026-10-18T12:00:00Z",
  content: { _tag: "Text", text: "Plans for the week", mentions: [], revision: 1, editedAt: null }
})
