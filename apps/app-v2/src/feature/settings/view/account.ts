/** The account menu in the workspace rail. */

import type { MenuGroup } from "@amends-dev/design/menu"
import { railAccount } from "@amends-dev/design/rail"
import type { Appearance } from "../../../appearance.ts"
import { initials } from "../../../view/members.ts"
import { SettingsBlock } from "../block.ts"
import { AccountBinding } from "../composition.ts"
import { type AccountEntry, ownName } from "../definition.ts"

const appearances = ["System", "Light", "Dark"] as const satisfies ReadonlyArray<Appearance>

/** The account menu's choices: the Appearances, the entries that go somewhere, and the one that ends the session. */
const accountGroups = (appearance: Appearance): ReadonlyArray<MenuGroup<AccountEntry>> => [
  {
    label: "Appearance",
    choices: appearances.map((value) => ({ value, label: value, isChecked: value === appearance }))
  },
  {
    choices: [
      { value: "SwitchWorkspace", label: "Switch workspace" },
      { value: "WorkspaceSettings", label: "Workspace settings" },
      { value: "ChangeName", label: "Change your name…" }
    ]
  },
  { choices: [{ value: "SignOut", label: "Sign out" }] }
]

/** What the account menu is given besides the model: the address the person signed in with, and their Appearance. */
export type AccountInputs = Readonly<{ email: string; appearance: Appearance }>

/**
 * The person's account at the foot of the rail: their initials, and a menu that names them over the address they
 * signed in with, which they choose their Appearance from, and which goes to another workspace, to the workspace's
 * settings, to the dialog that changes their name, and out. Before the replica holds their name, it names them by
 * their address.
 */
export const accountView = SettingsBlock.makeView.withInputs<AccountInputs>((model, { email, appearance }, h) => {
  const name = ownName(model)
  const hasName = name !== ""

  return railAccount(h, {
    name: hasName ? name : email,
    initials: initials(hasName ? name : email),
    header: hasName ? { title: name, detail: email } : { title: email },
    groups: accountGroups(appearance),
    embed: (viewInputs) =>
      h.block(AccountBinding.embedView({ slotId: "account", model: model.accountMenu, viewInputs }))
  })
})
