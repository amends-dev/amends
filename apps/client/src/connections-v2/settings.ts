import type { FormField, FormIssue } from "@amends/ui/components/form-fields";
import type { ConnectionV2 } from "./api.ts";

/** An integration's settings form, as the host describes it: an MCP elicitation form schema. */
type SettingsForm = ConnectionV2.IntegrationView["settings"];
type Property = SettingsForm["properties"][string];
/** Settings as the host takes them: text, a number, or yes or no, by name. */
export type Settings = Readonly<Record<string, string | number | boolean>>;

const described = (key: string, property: Property, required: boolean) => ({
  key,
  label: property.title ?? key,
  required,
  ...(property.description === undefined ? {} : { description: property.description }),
});

/** A form property as a field, or none for a list of choices, which settings never hold. */
const fieldOf = (key: string, property: Property, required: boolean): FormField | undefined => {
  const base = described(key, property, required);
  switch (property.type) {
    case "boolean":
      return { ...base, kind: "boolean" };
    case "number":
    case "integer":
      return {
        ...base,
        kind: "number",
        integer: property.type === "integer",
        ...(property.minimum === undefined ? {} : { minimum: property.minimum }),
        ...(property.maximum === undefined ? {} : { maximum: property.maximum }),
      };
    case "array":
      return undefined;
    case "string":
      if ("oneOf" in property)
        return {
          ...base,
          kind: "choice",
          options: property.oneOf.map((option) => ({ value: option.const, label: option.title })),
        };
      if ("enum" in property)
        return {
          ...base,
          kind: "choice",
          options: property.enum.map((value, index) => ({
            value,
            label: ("enumNames" in property ? property.enumNames?.[index] : undefined) ?? value,
          })),
        };
      return {
        ...base,
        kind: "text",
        ...(property.format === undefined ? {} : { format: property.format }),
        ...(property.minLength === undefined ? {} : { minLength: property.minLength }),
        ...(property.maxLength === undefined ? {} : { maxLength: property.maxLength }),
      };
  }
};

/** The fields an integration's settings form asks for, in its order. */
export const fieldsOf = (form: SettingsForm): FormField[] =>
  Object.entries(form.properties).flatMap(([key, property]) => {
    const field = fieldOf(key, property, form.required?.includes(key) ?? false);
    return field === undefined ? [] : [field];
  });

const isEmail = /^[^\s@]+@[^\s@]+$/;
const isDate = /^\d{4}-\d{2}-\d{2}$/;

/** What a field refuses in the text entered for it, once there is any. */
export function fieldIssue(field: FormField, text: string): FormIssue | undefined {
  const value = text.trim();
  if (value === "") return undefined;
  switch (field.kind) {
    case "text":
      if (
        (field.minLength !== undefined && value.length < field.minLength) ||
        (field.maxLength !== undefined && value.length > field.maxLength)
      )
        return "length";
      if (field.format === "email" && !isEmail.test(value)) return "format";
      if (field.format === "uri" && !URL.canParse(value)) return "format";
      if (field.format === "date" && !isDate.test(value)) return "format";
      if (field.format === "date-time" && Number.isNaN(Date.parse(value))) return "format";
      return undefined;
    case "number": {
      const number = Number(value);
      if (!Number.isFinite(number) || (field.integer && !Number.isInteger(number))) return "format";
      if (
        (field.minimum !== undefined && number < field.minimum) ||
        (field.maximum !== undefined && number > field.maximum)
      )
        return "range";
      return undefined;
    }
    case "boolean":
      return value === "true" || value === "false" ? undefined : "format";
    case "choice":
      return field.options.some((option) => option.value === value) ? undefined : "format";
  }
}

/** Every required field has text, and no field refuses what it has. */
export const settingsComplete = (
  fields: readonly FormField[],
  texts: Readonly<Record<string, string>>,
) =>
  fields.every((field) => {
    const text = texts[field.key] ?? "";
    return (!field.required || text.trim() !== "") && fieldIssue(field, text) === undefined;
  });

/** The settings the fields' texts give, leaving out the empty ones. */
export const settingsOf = (
  fields: readonly FormField[],
  texts: Readonly<Record<string, string>>,
): Settings =>
  Object.fromEntries(
    fields.flatMap((field) => {
      const text = (texts[field.key] ?? "").trim();
      if (text === "") return [];
      const value =
        field.kind === "number" ? Number(text) : field.kind === "boolean" ? text === "true" : text;
      return [[field.key, value] as const];
    }),
  );

/** Saved settings as the text their fields show. */
export const textsOf = (settings: Settings): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, String(value)]));
