/** Thread-list sort labels and welcome text. */

import type { TaskSort } from "../definition.ts"

/** The orders of the Tasks tab, as the person reads them. */
export const taskSortChoices: ReadonlyArray<readonly [TaskSort, string]> = [
  ["Latest", "Latest activity"],
  ["Newest", "Newest"],
  ["Oldest", "Oldest"]
]

const memberNamesList = new Intl.ListFormat("en", { style: "long", type: "conjunction" })

/** What the welcome calls the person among the members' names. */
export const selfName = "You"

/**
 * Who belongs to a team as its welcome says it, from `names`: "You, Alex Morgan, and Sara are members.", "You and Sara
 * are members.", and for one "You are a member." or "Sara is a member.".
 */
export const membersLine = (names: ReadonlyArray<string>): string => {
  if (names.length !== 1) {
    return `${memberNamesList.format(names)} are members.`
  }

  return names[0] === selfName ? `${selfName} are a member.` : `${names[0]} is a member.`
}
