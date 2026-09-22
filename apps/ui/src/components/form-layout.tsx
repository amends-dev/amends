import { Text } from "./text.tsx";
import type { JSX } from "solid-js";
import * as s from "./form-layout.css.ts";
export function FormLayout(props: {
  children: JSX.Element;
  id?: string;
  fullWidth?: boolean;
  /** Let the consuming form present validation feedback and manage focus itself. */
  noValidate?: boolean;
  onSubmit: JSX.EventHandler<HTMLFormElement, SubmitEvent>;
}) {
  return (
    <form
      id={props.id}
      class={s.root}
      data-full-width={props.fullWidth || undefined}
      onSubmit={props.onSubmit}
      noValidate={props.noValidate}
    >
      {props.children}
    </form>
  );
}
export function FormColumns(props: {
  children: JSX.Element;
  proportions?: "equal" | "narrow-start" | "identity";
}) {
  return (
    <div class={s.columnsContainer}>
      <div class={s.columns} data-proportions={props.proportions}>
        {props.children}
      </div>
    </div>
  );
}
export function FormSection(props: { label: string; description?: string; children: JSX.Element }) {
  return (
    <fieldset class={s.section}>
      <Text as="legend" variant="label" class={s.label}>
        {props.label}
      </Text>
      {props.children}
      {props.description && (
        <Text as="p" variant="bodySmall" class={s.description}>
          {props.description}
        </Text>
      )}
    </fieldset>
  );
}
