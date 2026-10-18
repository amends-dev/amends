/**
 * The app's state: the host it talks to, and the page the person is on. Signed out, it is the
 * sign-in form, a step at a time; signed in, the session, the workspaces the person belongs to, and
 * the one they opened, whose store syncs while it is open.
 */

import { Workspace } from "@amends-dev/core/workspace"
import * as SignIn from "@amends-dev/gateway/SignIn"
import * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import * as Schema from "effect/Schema"
import { defineTaggedUnion } from "foldkit/schema"

/** Where signing in has got to: an address to send a code to, then the code it was sent. */
export const SignInForm = defineTaggedUnion({
  EnteringEmail: { email: Schema.String, error: Schema.Option(Schema.String) },
  SendingCode: { email: Schema.String },
  EnteringCode: { email: Schema.String, code: Schema.String, error: Schema.Option(Schema.String) },
  CheckingCode: { email: Schema.String, code: Schema.String }
})
export type SignInForm = typeof SignInForm.Type

/** The workspaces the person belongs to, as the host lists them. */
export const Workspaces = defineTaggedUnion({
  Loading: {},
  Loaded: { memberships: Schema.Array(WorkspaceDirectory.Membership) },
  Failed: { error: Schema.String }
})
export type Workspaces = typeof Workspaces.Type

/** How many records of each kind a replica holds. */
export const Counts = Schema.Record(Schema.String, Schema.Int)

/** The open workspace's store: opening, open with what its replica holds, or failed. */
export const StoreState = defineTaggedUnion({
  Opening: {},
  Open: { counts: Counts },
  Failed: { error: Schema.String }
})
export type StoreState = typeof StoreState.Type

/** The workspace the person opened, and its store. */
export const Opened = Schema.Struct({ workspace: Workspace.Workspace, store: StoreState })
export type Opened = typeof Opened.Type

export const Page = defineTaggedUnion({
  SignedOut: { form: SignInForm },
  SignedIn: { session: SignIn.Session, workspaces: Workspaces, opened: Schema.Option(Opened) }
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({ apiUrl: Schema.String, page: Page })
export type Model = typeof Model.Type
