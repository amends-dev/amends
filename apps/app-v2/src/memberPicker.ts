/**
 * Choosing workspace members with the design's members picker: the combobox Block every picker binds, the people it
 * offers, the person themself locked in it as "You", the line that counts who is in, and the focus a picker takes back
 * after a chip is removed.
 */

import type { Member, MemberId } from "@amends-dev/core/workspace"
import type { PickerPerson } from "@amends-dev/design/members"
import { Multi, inputId } from "@foldkit/ui/combobox"
import * as Effect from "effect/Effect"
import * as Dom from "foldkit/dom"
import { isAgent } from "./data/members.ts"
import { pluralize } from "./view/counts.ts"
import { memberMark } from "./view/members.ts"

/** The headless combobox every members picker binds, whose values are the IDs of members. */
export const MembersComboboxBlock = Multi.create()

/** `member` as the picker offers them: their name and mark, and whether they are a person or an agent. */
export const pickerPerson = (member: Member.Member): PickerPerson => ({
  id: member.id,
  name: member.name,
  mark: memberMark(member),
  kind: isAgent(member) ? "Agent" : "Person"
})

/** The people of `members` as the picker offers them. */
export const pickerPeople = (members: ReadonlyArray<Member.Member>): ReadonlyArray<PickerPerson> =>
  members.map(pickerPerson)

/** The members of `members` whose IDs are `memberIds`, as the picker offers them, in the order of `memberIds`. */
export const pickerPeopleChosen = (
  members: ReadonlyArray<Member.Member>,
  memberIds: ReadonlyArray<MemberId.MemberId>
): ReadonlyArray<PickerPerson> =>
  memberIds.flatMap((memberId) => members.filter((member) => member.id === memberId).map(pickerPerson))

/** The person themself, `memberId`, as the picker holds them locked: named "You", with their own mark. */
export const youInPicker = (members: ReadonlyArray<Member.Member>, memberId: MemberId.MemberId): PickerPerson => {
  const self = members.find((member) => member.id === memberId)

  return self === undefined
    ? { id: memberId, name: "You", mark: { text: "Y" }, kind: "Person" }
    : { ...pickerPerson(self), name: "You" }
}

/** What a picker says under it of who is in: the person themself, who is always included, and `chosen` others. */
export const includedHint = (chosen: number): string =>
  chosen === 0
    ? "You’re included automatically. Add others now or later."
    : `${pluralize(chosen + 1, "member", "members")}, including you.`

/** Move focus to the input of the picker `id`, such as after the chip that held it was removed. */
export const focusMembersInput = (id: string) => Dom.focus(`#${CSS.escape(inputId(id))}`).pipe(Effect.ignore)
