import * as Option from "effect/Option"
import { LoadWorkspaces } from "./command.ts"
import { WorkspacesComposition } from "./composition.ts"
import { Workspaces } from "./definition.ts"

/**
 * The name a person might go by in a workspace, from their address: the part before the "@" with its first letter
 * in capitals, "Dave" for "dave@example.com".
 */
export const suggestNameFromEmail = (email: string): string => {
  const [first = "", ...rest] = Array.from(email.split("@")[0] ?? "")
  return [first.toUpperCase(), ...rest].join("")
}

/**
 * The listing as it starts, under way, for the person whose address is `email`, with nothing being done in the dialog
 * and the dialog closed, and no confirmation showing.
 */
export const init = WorkspacesComposition.makeInit((email: string) => ({
  model: {
    workspaces: Workspaces.Loading(),
    entering: Option.none(),
    suggestedName: suggestNameFromEmail(email),
    confirmations: [],
    nextConfirmationId: 1
  },
  commands: [LoadWorkspaces()]
}))
