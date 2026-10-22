/** The thread or member details beside the open destination. */

import type { RenderInfo } from "@foldkit/ui/dialog"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { memberView as settingsMemberView } from "../../../feature/settings/view/member.ts"
import { AsideBinding, HomeBinding, SettingsBinding, type WorkspaceViewBuilder } from "../composition.ts"
import { type Model, Open } from "../definition.ts"
import { isThreadOpen } from "../home/definition.ts"
import { asideDialogView as homeAsideDialogView } from "../home/view/overlay.ts"
import { threadView as homeThreadView } from "../home/view/thread.ts"

/** How a dialog is drawn, given what it publishes. */
type ToView = (render: RenderInfo) => Html

/**
 * What the side pane is called, which names the dialog that holds it, what it shows, whether its dialog is open, and
 * the dialog, which the shell draws.
 */
type Aside = Readonly<{ label: string; view: Html; isOpen: boolean; dialog: (toView: ToView) => Html }>

/**
 * The side pane: Home's thread, while Home shows one, or the member open in the settings, while there is one, given
 * the time now.
 */
export const asideView = (model: Model, now: DateTime.Utc, h: WorkspaceViewBuilder): Option.Option<Aside> =>
  Open.matchOrElse(
    model.open,
    {
      Home: () =>
        isThreadOpen(model.home)
          ? Option.some({
              label: "Thread",
              view: h.block(
                HomeBinding.embedView({
                  slotId: "home-thread",
                  model: model.home,
                  view: homeThreadView,
                  viewInputs: { now }
                })
              ),
              isOpen: model.home.aside.isOpen,
              dialog: (toView: ToView) =>
                h.block(
                  HomeBinding.embedView({
                    slotId: "home-aside",
                    model: model.home,
                    view: homeAsideDialogView,
                    viewInputs: { toView }
                  })
                )
            })
          : Option.none(),
      Settings: ({ memberId }) =>
        Option.isSome(memberId)
          ? Option.some({
              label: "Member details",
              view: h.block(
                SettingsBinding.embedView({
                  slotId: "settings-member",
                  model: model.settings,
                  view: settingsMemberView
                })
              ),
              isOpen: model.aside.isOpen,
              dialog: (toView: ToView) =>
                h.block(AsideBinding.embedView({ slotId: "aside", model: model.aside, viewInputs: { toView } }))
            })
          : Option.none()
    },
    () => Option.none()
  )
