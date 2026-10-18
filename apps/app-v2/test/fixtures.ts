import { Identity } from "@amends-dev/core/identity"
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
