import { For, Match, Switch } from "solid-js"
import { Choice } from "../choice/index.ts"
import { Field } from "../field/index.ts"
import { Input } from "../input/index.ts"
import { Select } from "../select/index.ts"

/**
 * A field a form asks for, described as data rather than drawn, such as one of an integration's
 * settings: text, a number, yes or no, or one of a few options.
 */
export type FormField = {
  readonly key: string
  readonly label: string
  readonly description?: string
  readonly required: boolean
} & (
  | {
      readonly kind: "text"
      readonly format?: "email" | "uri" | "date" | "date-time"
      readonly minLength?: number
      readonly maxLength?: number
    }
  | {
      readonly kind: "number"
      readonly integer: boolean
      readonly minimum?: number
      readonly maximum?: number
    }
  | { readonly kind: "boolean" }
  | {
      readonly kind: "choice"
      readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>
    }
)

/** What a field refuses in a value: its shape, its length, or its size. */
export type FormIssue = "format" | "length" | "range"

export interface FormFieldsProps {
  readonly fields: ReadonlyArray<FormField>
  /** A field's value as text: "true" or "false" for yes or no, an option's value for a choice. */
  readonly value: (key: string) => string
  readonly onChange: (key: string, value: string) => void
  /** Why a field's value would be refused, once it has one. */
  readonly issue?: (key: string) => FormIssue | undefined
  readonly disabled?: boolean
}

/** "Server URL · Optional" for a field the form does not require. */
export const fieldLabel = (field: FormField) => (field.required ? field.label : `${field.label} · Optional`)

const inputTypes = { email: "email", uri: "url", date: "date", "date-time": "datetime-local" }
/** The Input type a text field's format takes. */
const inputType = (format: keyof typeof inputTypes | undefined) => (format === undefined ? "text" : inputTypes[format])

/** "1 to 10", "at least 1", or "at most 10". */
const bounds = (low: number | undefined, high: number | undefined) =>
  low !== undefined && high !== undefined
    ? `${low} to ${high}`
    : low !== undefined
      ? `at least ${low}`
      : `at most ${high}`

/** What a field says about a value it refuses. */
export function formIssueText(field: FormField, issue: FormIssue | undefined) {
  if (issue === undefined) return undefined
  switch (field.kind) {
    case "text":
      if (issue === "length")
        return field.minLength === field.maxLength
          ? `Use exactly ${field.minLength} characters.`
          : `Use ${bounds(field.minLength, field.maxLength)} characters.`
      return field.format === "email"
        ? "Enter an email address."
        : field.format === "uri"
          ? "Enter a full address, such as https://example.com."
          : "Enter a date."
    case "number":
      if (issue === "range")
        return `Enter ${field.integer ? "a whole number" : "a number"} ${
          field.minimum !== undefined && field.maximum !== undefined ? "from" : "of"
        } ${bounds(field.minimum, field.maximum)}.`
      return field.integer ? "Enter a whole number." : "Enter a number."
    default:
      return "Choose one of the options."
  }
}

/**
 * The fields of a form described as data, each in a Field with its label, help, and what it
 * refuses: text in an Input of its format's type, a number in a number Input, yes or no as two
 * choices, and options in a Select, which offers "Not set" for a field the form does not require.
 * Place it inside the form, whose gap spaces the fields.
 */
export function FormFields(props: FormFieldsProps) {
  return (
    <For each={props.fields}>
      {(field) => (
        <Switch>
          <Match when={field.kind === "boolean"}>
            <Choice.Group
              label={fieldLabel(field)}
              hint={field.description}
              value={props.value(field.key)}
              onChange={(value) => props.onChange(field.key, value)}
              disabled={props.disabled}
            >
              <Choice.Option value="true">Yes</Choice.Option>
              <Choice.Option value="false">No</Choice.Option>
            </Choice.Group>
          </Match>
          <Match when={field.kind === "choice" && field}>
            {(choice) => (
              <Field.Root hint={field.description}>
                <Field.Label>{fieldLabel(field)}</Field.Label>
                <Select
                  options={[...(field.required ? [] : [{ value: "", label: "Not set" }]), ...choice().options]}
                  value={props.value(field.key) || undefined}
                  onChange={(value) => props.onChange(field.key, value)}
                  placeholder={field.required ? "Choose one" : "Not set"}
                  disabled={props.disabled}
                />
              </Field.Root>
            )}
          </Match>
          <Match when={field.kind === "number" && field}>
            {(number) => (
              <Field.Root hint={field.description} error={formIssueText(field, props.issue?.(field.key))}>
                <Field.Label>{fieldLabel(field)}</Field.Label>
                <Input
                  type="number"
                  inputMode={number().integer ? "numeric" : "decimal"}
                  step={number().integer ? 1 : "any"}
                  min={number().minimum}
                  max={number().maximum}
                  value={props.value(field.key)}
                  onInput={(event) => props.onChange(field.key, event.currentTarget.value)}
                  disabled={props.disabled}
                  required={field.required}
                />
              </Field.Root>
            )}
          </Match>
          <Match when={field.kind === "text" && field}>
            {(text) => (
              <Field.Root hint={field.description} error={formIssueText(field, props.issue?.(field.key))}>
                <Field.Label>{fieldLabel(field)}</Field.Label>
                <Input
                  type={inputType(text().format)}
                  minLength={text().minLength}
                  maxLength={text().maxLength}
                  value={props.value(field.key)}
                  onInput={(event) => props.onChange(field.key, event.currentTarget.value)}
                  autocomplete="off"
                  spellcheck={false}
                  disabled={props.disabled}
                  required={field.required}
                />
              </Field.Root>
            )}
          </Match>
        </Switch>
      )}
    </For>
  )
}
