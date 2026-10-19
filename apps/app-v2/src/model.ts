/**
 * The app's state: the page the person is on. Signed out, the sign-in form; signed in, their
 * account, the workspaces they belong to, and the one they opened.
 */

import { WorkspaceId } from "@amends-dev/core/workspace"
import * as Accounts from "@amends-dev/gateway/Accounts"
import * as Schema from "effect/Schema"
import { defineTaggedUnion } from "foldkit/schema"
import { SignInBlock } from "./page/signIn/block.ts"
import { WorkspaceBlock } from "./page/workspace/block.ts"
import { WorkspacesBlock } from "./page/workspaces/block.ts"

/** The workspace the person opened. */
export const Opened = Schema.Struct({ workspaceId: WorkspaceId.WorkspaceId, model: WorkspaceBlock.Model })
export type Opened = typeof Opened.Type

export const Page = defineTaggedUnion({
  SignedOut: { signIn: SignInBlock.Model },
  SignedIn: { account: Accounts.Account, workspaces: WorkspacesBlock.Model, workspace: Schema.Option(Opened) }
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({ page: Page })
export type Model = typeof Model.Type
