/** Home’s profile card and dialogs, kept in the workspace shell. */

import type { RenderInfo } from "@foldkit/ui/dialog"
import type { Html } from "foldkit/html"
import { dialogView as groupsDialogView } from "../../../../feature/groups/view/dialog.ts"
import { view as memberProfileView } from "../../../../feature/profileCard/view.ts"
import { AsideBinding, GroupsBinding, HomeComposition, ProfileCardBinding } from "../composition.ts"

/** The card of the member whose mark, name, or mention the person opened, which the shell keeps in the frame. */
export const profileCardView = HomeComposition.makeView((model, h) =>
  h.block(ProfileCardBinding.embedView({ slotId: "profile-card", model: model.profileCard, view: memberProfileView }))
)

/** How the shell draws the side pane's dialog, which it lends. */
export type AsideDialogInputs = Readonly<{ toView: (render: RenderInfo) => Html }>

/**
 * The side pane's dialog, which the shell draws around the thread and keeps in the document whether or not it is open.
 */
export const asideDialogView = HomeComposition.makeView.withInputs<AsideDialogInputs>((model, { toView }, h) =>
  h.block(AsideBinding.embedView({ slotId: "aside", model: model.aside, viewInputs: { toView } }))
)

/**
 * The dialogs of the groups, for starting a team or a conversation, which the shell keeps in the frame whether or not
 * the sidebar or the browse page that opens them is on the page.
 */
export const dialogView = HomeComposition.makeView((model, h) =>
  h.block(GroupsBinding.embedView({ slotId: "groups-dialog", model: model.groups, view: groupsDialogView }))
)
