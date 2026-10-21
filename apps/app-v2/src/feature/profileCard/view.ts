import { type ProfileAction, profileCard } from "@amends-dev/design/profile"
import * as Option from "effect/Option"
import { AnchorProfileCard } from "./command.ts"
import { ProfileCardComposition } from "./composition.ts"
import { Card, type MemberProfile, Message } from "./definition.ts"
import { shownProfile } from "./profile.ts"

/**
 * What the person can do about the member: nothing for one who left; change their own name for themself; otherwise
 * message them, and open the page of an agent.
 */
export const actionsOf = (profile: MemberProfile): ReadonlyArray<ProfileAction<Message>> => {
  if (profile.isFormer) {
    return []
  }

  if (profile.isYou) {
    return [{ label: "Change name", onClick: Message.ClickedChangeName() }]
  }

  return [
    { label: "Message", onClick: Message.ClickedMessage() },
    ...(Option.isSome(profile.agentId) ? [{ label: "Open agent", onClick: Message.ClickedOpenAgent() }] : [])
  ]
}

/** Escape closes the card. */
const closeOnEscape = (key: string): Option.Option<Message> =>
  key === "Escape" ? Option.some(Message.RequestedClose()) : Option.none()

/**
 * The card of the member, once it is read, placed against the trigger that opened it, which takes the focus into it and
 * gets it back when the card closes by Escape or its Close; the card also closes when the focus leaves it. Nothing
 * while no card is open or the member is being read.
 */
export const view = ProfileCardComposition.makeView((model, h) =>
  Card.matchOrElse(
    model.card,
    {
      Showing: ({ triggerId, profile }) =>
        profileCard(h, {
          profile: Option.getOrUndefined(Option.map(profile, shownProfile)),
          actions: Option.match(profile, { onNone: () => [], onSome: actionsOf }),
          onClose: Message.RequestedClose(),
          attributes: [
            h.Tabindex(-1),
            h.Style({ position: "absolute", margin: "0", visibility: "hidden" }),
            h.OnMount(AnchorProfileCard({ triggerId })),
            h.OnKeyDownPreventDefault(closeOnEscape),
            h.OnFocusLeave(Message.LeftCard())
          ]
        })
    },
    () => h.empty
  )
)
