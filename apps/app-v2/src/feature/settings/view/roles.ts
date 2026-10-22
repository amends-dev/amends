/** Role choices shared by membership and invitation forms. */

import { givableRoles } from "../../../data/workspace.ts"
import type { Model } from "../definition.ts"

/** The roles the person may give, each with its name, to choose from. */
export const roleChoices = (model: Model) => givableRoles(model).map(({ id, name }) => [id, name] as const)
