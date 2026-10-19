/**
 * The app's state: the page the person is on, the width of the window, and the time now. Signed out, the page
 * is the sign-in form; signed in, their account, the workspaces they belong to, and the one they opened.
 */

import { WorkspaceId } from "@amends-dev/core/workspace"
import { Viewport } from "@amends-dev/design/viewport"
import * as Accounts from "@amends-dev/gateway/Accounts"
import * as Option from "effect/Option"
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

export const Model = Schema.Struct({ page: Page, viewport: Viewport, now: Schema.DateTimeUtc })
export type Model = typeof Model.Type

/** The workspace the person has open, while one is. */
export const openedWorkspaceId = (model: Model): Option.Option<WorkspaceId.WorkspaceId> =>
  Page.matchOrElse(
    model.page,
    { SignedIn: ({ workspace }) => Option.map(workspace, ({ workspaceId }) => workspaceId) },
    () => Option.none()
  )
