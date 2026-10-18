/**
 * A connection's settings as the person fills them in, from the form its integration gives: each
 * field as the view shows it, the draft the person writes, and the settings the draft makes, or why
 * it makes none. A connection's settings are text, numbers, and yes or no, so a field of several
 * choices at once, which a form may hold, is passed over.
 */

import type { Connection as ConnectionContract, Integration } from "@amends-dev/connection"
import type { Connection } from "@amends-dev/core/connection"
import * as McpSchema from "effect/ai/McpSchema"
import * as Data from "effect/Data"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

/** What a field takes: text, a number, yes or no, or one of its choices, each a value and its title. */
export type Input = Data.TaggedEnum<{
  Text: {}
  Number: { readonly integer: boolean }
  Toggle: {}
  Choice: { readonly choices: ReadonlyArray<readonly [value: string, title: string]> }
}>

export const Input = Data.taggedEnum<Input>()

/** One field of an integration's settings: its name, title, description, whether it is required, and what it takes. */
export interface Field {
  readonly name: string
  readonly title: string
  readonly description: string | undefined
  readonly required: boolean
  readonly input: Input
}

/** A draft of settings: each field's text, or whether it is on. */
export const Draft = Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Boolean]))
export type Draft = typeof Draft.Type

/** What `definition` takes, or undefined for one of several choices at once. */
const inputOf = (definition: McpSchema.PrimitiveSchemaDefinition): Input | undefined => {
  if (Schema.is(McpSchema.ElicitationBoolean)(definition)) return Input.Toggle()
  if (Schema.is(McpSchema.ElicitationNumber)(definition))
    return Input.Number({ integer: definition.type === "integer" })
  if (Schema.is(McpSchema.TitledSingleSelectEnum)(definition))
    return Input.Choice({ choices: definition.oneOf.map(({ const: value, title }) => [value, title] as const) })
  if (Schema.is(McpSchema.LegacyTitledEnum)(definition))
    return Input.Choice({
      choices: definition.enum.map((value, index) => [value, definition.enumNames?.[index] ?? value] as const)
    })
  if (Schema.is(McpSchema.UntitledSingleSelectEnum)(definition))
    return Input.Choice({ choices: definition.enum.map((value) => [value, value] as const) })
  if (Schema.is(McpSchema.ElicitationString)(definition)) return Input.Text()
  return undefined
}

/** The fields of `form`, in the order it lists them. */
export const fieldsOf = (form: Integration.SettingsForm): ReadonlyArray<Field> =>
  Object.entries(form.properties).flatMap(([name, definition]) => {
    const input = inputOf(definition)
    return input === undefined
      ? []
      : [
          {
            name,
            title: definition.title ?? name,
            description: definition.description,
            required: form.required?.includes(name) ?? false,
            input
          }
        ]
  })

/** The draft `form` starts from: `settings` where given, otherwise each field's default. */
export const draftOf = (form: Integration.SettingsForm, settings: Connection.Settings = {}): Draft =>
  Object.fromEntries(
    fieldsOf(form).map(({ name, input }) => {
      const value = settings[name] ?? form.properties[name]?.default
      return [
        name,
        Input.$match(input, {
          Toggle: () => value === true,
          Text: () => (typeof value === "string" ? value : ""),
          Number: () => (typeof value === "number" ? String(value) : ""),
          Choice: ({ choices }) => (typeof value === "string" ? value : (choices[0]?.[0] ?? ""))
        })
      ]
    })
  )

/** The settings `draft` makes of `form`'s fields, or which field it leaves wanting. */
export const settingsOf = (
  form: Integration.SettingsForm,
  draft: Draft
): Result.Result<Connection.Settings, string> => {
  const settings: Record<string, string | number | boolean> = {}
  for (const { name, title, required, input } of fieldsOf(form)) {
    const value = draft[name]
    if (Input.$is("Toggle")(input)) {
      settings[name] = value === true
      continue
    }
    const text = typeof value === "string" ? value.trim() : ""
    if (text === "") {
      if (required) return Result.fail(`${title} is required.`)
      continue
    }
    if (Input.$is("Number")(input)) {
      const number = Number(text)
      if (!Number.isFinite(number) || (input.integer && !Number.isInteger(number)))
        return Result.fail(`${title} needs ${input.integer ? "a whole number" : "a number"}.`)
      settings[name] = number
    } else settings[name] = text
  }
  return Result.succeed(settings)
}

/** How a connection authenticates, as the person reads it. */
export const authLabels: Readonly<Record<ConnectionContract.AuthMethod, string>> = {
  apiKey: "API key",
  none: "No key"
}
