/**
 * The card a member's mark, name, or mention opens, as `apps/ui`'s profile card draws it: who they are, what they are,
 * and what the reader can do, on a popover. The card is only the surface; the Block that holds it places it against
 * the element that opened it, and owns the keys that close it.
 *
 * A list of rows that open cards is given one `ProfileOpener`, which says how its triggers are told apart and what a
 * trigger sends. A row's author line, its mark, and the mentions in its text are triggers (`profileTrigger`).
 */

import * as Button from "@foldkit/ui/button"
import type { Attribute, Html, HtmlBuilder } from "foldkit/html"
import { button, iconButton } from "./control.ts"
import type { LogoMotion } from "./logo.ts"
import { activityMark, type MarkContent, type MarkStatus, mark } from "./mark.ts"

const cardLook =
  "z-50 box-border flex w-80 flex-col gap-5 border border-outline bg-popover p-4 text-ink shadow-popover outline-none [--amends-status-knockout:var(--amends-popover)] max-tablet:w-[min(calc(100vw-2rem),22.375rem)]"

const identityLook = "flex items-start gap-3"

const namesLook = "flex min-w-0 flex-1 flex-col gap-0.5"

const nameLook = "m-0 text-body-touch font-medium wrap-anywhere"

const detailLook =
  "m-0 flex items-center gap-1.25 text-hint text-ink-secondary data-[tone=caution]:text-caution-text data-[tone=danger]:text-danger-text"

const closeLook = "-mt-1 -me-1 flex flex-none"

const noteLook = "m-0 text-control text-ink-secondary"

const actionsLook = "flex gap-2 [&>*]:flex-1"

const unavailableLook = "m-0 min-w-0 flex-1 text-control text-ink-secondary"

const triggerLook = "cursor-pointer focus-ring aria-expanded:underline aria-expanded:underline-offset-3"

const buttonTriggerLook = "inline-block max-w-full border-0 bg-transparent p-0 text-start"

const markTriggerLook = "flex flex-none cursor-pointer"

const statusTones: Readonly<Record<MarkStatus["kind"], "caution" | "danger" | undefined>> = {
  available: undefined,
  offline: undefined,
  attention: "caution",
  blocked: "danger"
}

/**
 * A member as their card shows them: their `mark`, their `name`, whether they are a person or an agent, whether they
 * are the reader, and whether they left the workspace. A member who is still there may have a `status`: the patch on
 * the mark, and its label after the kind, such as "Needs setup", with the `detail` under the name for one that needs
 * attention. An agent at work has a `motion`, which moves the logo before the label.
 */
export type Profile = Readonly<{
  name: string
  mark: MarkContent
  kind: "Person" | "Agent"
  isYou?: boolean
  isFormer?: boolean
  status?: MarkStatus | undefined
  motion?: LogoMotion | undefined
}>

/** What the card offers the reader to do about the member: a button that sends `onClick`. */
export type ProfileAction<Message> = Readonly<{ label: string; onClick: Message }>

/**
 * How the triggers of a list open cards. A `scope` begins the id of each of its triggers, which is what the card
 * anchors to, so that its triggers are told from the triggers of every other list on the page. The `openTriggerId` is
 * the trigger whose card is open, which says it is expanded. A trigger sends what `open` makes of the member it is for
 * and its own id.
 */
export type ProfileOpener<Message> = Readonly<{
  scope: string
  openTriggerId?: string | undefined
  open: (memberId: string, triggerId: string) => Message
}>

/** The id of the trigger of `opener` that `part` names, such as a message's key and "name". */
export const profileTriggerId = <Message>(opener: ProfileOpener<Message>, part: string): string =>
  `${opener.scope}-${part}`

/**
 * The element that opens the card of the member `memberId`, with `look` for the classes of what it stands in for. It is
 * the element `children` are in, with the id `profileTriggerId` makes of `part`. By default it is a button that Tab
 * reaches, named by its children, which says whether its card is open (`aria-expanded`) and that it opens a dialog;
 * with `isFocusable: false` it is a mark beside the name, hidden from assistive technology, which meets the name.
 */
export const profileTrigger = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  opener: ProfileOpener<Message>,
  config: Readonly<{
    memberId: string
    part: string
    look: string
    isFocusable?: boolean
    children: ReadonlyArray<Html | string>
  }>
): Html => {
  const id = profileTriggerId(opener, config.part)
  const opens = opener.open(config.memberId, id)

  if (config.isFocusable === false) {
    return h.span(
      [h.Id(id), h.AriaHidden(true), h.OnClick(opens), h.Class(`${markTriggerLook} ${config.look}`)],
      config.children
    )
  }

  return Button.view(
    {
      onClick: opens,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.Id(id),
            h.AriaHasPopup("dialog"),
            h.AriaExpanded(opener.openTriggerId === id),
            h.Class(`${triggerLook} ${buttonTriggerLook} ${config.look}`)
          ],
          config.children
        )
    },
    h
  )
}

const detailOf = (profile: Profile): string =>
  [
    profile.kind,
    profile.isYou === true ? "You" : undefined,
    profile.isFormer === true ? "Former member" : undefined,
    profile.isFormer === true ? undefined : profile.status?.label
  ]
    .filter((part) => part !== undefined)
    .join(" · ")

/** Why the member needs attention, or that they left: the line under their name, when there is one. */
const noteOf = (profile: Profile): string | undefined =>
  profile.isFormer === true ? "No longer in this workspace." : profile.status?.detail

const renderClose = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, onClose: Message): Html =>
  h.span(
    [h.Class(closeLook)],
    [iconButton(h, { icon: "mark-close", label: "Close", onClick: onClose }, { size: "compact" })]
  )

const renderProfile = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  profile: Profile,
  onClose: Message
): ReadonlyArray<Html> => {
  const status = profile.isFormer === true ? undefined : profile.status
  const tone = status === undefined ? undefined : statusTones[status.kind]
  const note = noteOf(profile)

  return [
    h.div(
      [h.Class(identityLook)],
      [
        mark(h, { ...profile.mark, size: "lg", status, isTooltipHidden: true }),
        h.div(
          [h.Class(namesLook)],
          [
            h.p([h.Class(nameLook)], [profile.name]),
            h.p(
              [...(tone === undefined ? [] : [h.DataAttribute("tone", tone)]), h.Class(detailLook)],
              [
                profile.motion === undefined || profile.isFormer === true ? h.empty : activityMark(h, profile.motion),
                detailOf(profile)
              ]
            )
          ]
        ),
        renderClose(h, onClose)
      ]
    ),
    note === undefined ? h.empty : h.p([h.Class(noteLook)], [note])
  ]
}

/**
 * The card of `profile`, a dialog named by the member's name: the mark at 40px with the patch of how they stand, the
 * name, what they are after it, such as "Agent · Needs setup" in the caution color, "Person · You" for the reader, and
 * "Person · Former member" for someone who left, with why under them for a member who needs attention, or "No longer
 * in this workspace." for one who left; a Close button at the end of the name's line; and `actions`, buttons that
 * share the card's width, such as Message. With no `profile` the card says "Profile unavailable" for a member who
 * cannot be shown. The card is 320px wide, 358px at most on a phone, where it keeps 16px from the window's edges.
 * `attributes` go onto the card, such as its id, the mount that places it, and its keys.
 */
export const profileCard = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    profile: Profile | undefined
    actions: ReadonlyArray<ProfileAction<Message>>
    onClose: Message
    attributes?: ReadonlyArray<Attribute<Message, Requirements>>
  }>
): Html => {
  const { profile, actions, onClose } = config

  return h.div(
    [
      h.Role("dialog"),
      h.AriaLabel(profile === undefined ? "Profile unavailable" : profile.name),
      ...(config.attributes ?? []),
      h.Class(cardLook)
    ],
    profile === undefined
      ? [
          h.div(
            [h.Class(identityLook)],
            [h.p([h.Class(unavailableLook)], ["Profile unavailable"]), renderClose(h, onClose)]
          )
        ]
      : [
          ...renderProfile(h, profile, onClose),
          actions.length === 0
            ? h.empty
            : h.div(
                [h.Class(actionsLook)],
                actions.map((action) => button(h, action.label, action.onClick))
              )
        ]
  )
}
