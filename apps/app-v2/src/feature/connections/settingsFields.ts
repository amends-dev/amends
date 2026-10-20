/**
 * The fields of an integration's settings, which the page of a connection and the dialog that adds one both ask for:
 * each as its form describes it, a field for text or a number, a switch for yes or no, and a select for one of a few
 * choices, with what the integration says of it under it.
 */

import type { Connection } from "@amends-dev/core/connection"
import { choiceSelect, field, toggle } from "@amends-dev/design/control"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import * as SettingsForm from "../../settingsForm.ts"
import type { ConnectionsViewBuilder } from "./composition.ts"
import type { Message } from "./definition.ts"

/** What a form asks its settings fields: the form, what is in it now, and what a change to a field sends. */
export type SettingsFieldsConfig = Readonly<{
  /** Starts the ID of each field, so that a form beside another in the document names its own. */
  idPrefix: string
  settings: Connection.IntegrationView["settings"]
  draft: SettingsForm.Draft
  isDisabled: boolean
  onChange: (name: string, value: string | boolean) => Message
}>

/** The fields of `settings`, each as `draft` fills it in; a field the form doesn't require says it is optional. */
export const settingsFields = (
  h: ConnectionsViewBuilder,
  { idPrefix, settings, draft, isDisabled, onChange }: SettingsFieldsConfig
): ReadonlyArray<Html> =>
  SettingsForm.fieldsOf(settings).map(({ name, title, description, required, input }) => {
    const id = `${idPrefix}-${name}`
    const label = required ? title : `${title} · Optional`
    const value = draft[name]
    const text = typeof value === "string" ? value : ""
    const hint = description === undefined ? {} : { hint: description }
    const onInput = (typed: string) => onChange(name, typed)

    return SettingsForm.Input.$match(input, {
      Toggle: () =>
        toggle(h, { id, label, isOn: value === true, isDisabled, onToggle: (isOn) => onChange(name, isOn) }),
      Text: () =>
        field(
          h,
          { id, label, type: "text", value: text, ...hint, isAutofocus: false, isDisabled, onInput },
          Option.none()
        ),
      Number: () =>
        field(
          h,
          { id, label, type: "number", value: text, ...hint, isAutofocus: false, isDisabled, onInput },
          Option.none()
        ),
      Choice: ({ choices }) =>
        choiceSelect(h, { id, label, choices, value: text, ...hint, isDisabled, onChange: onInput })
    })
  })
