/** The workspace picker, its entry dialog, and confirmations. */

import type { WorkspaceId } from "@amends-dev/core/workspace"
import { screenContent } from "@amends-dev/design/centered"
import { confirmation, confirmationStack } from "@amends-dev/design/toast"
import type * as DateTime from "effect/DateTime"
import type { Html } from "foldkit/html"
import { WorkspacesComposition, type WorkspacesViewBuilder } from "../composition.ts"
import type { Model } from "../definition.ts"
import { dialogView } from "./dialog.ts"
import { listing } from "./list.ts"

/** What the person did that is confirmed, which goes by itself, in a live region that is there before the first. */
const confirmations = (model: Model, h: WorkspacesViewBuilder): Html =>
  confirmationStack(
    h,
    model.confirmations.map(({ id, text }) => confirmation(h, { key: `${id}`, text }))
  )

/** The time now, which when each invitation closes is read from. */
export type ViewInputs = Readonly<{
  now: DateTime.Utc
  workspaceHref?: ((id: WorkspaceId.WorkspaceId) => string | undefined) | undefined
}>

export const view = WorkspacesComposition.makeView.withInputs<ViewInputs>((model, { now, workspaceHref }, h) =>
  screenContent(h, [...listing(model, now, h, workspaceHref), dialogView(model, h), confirmations(model, h)])
)
