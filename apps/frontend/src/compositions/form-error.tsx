import type { JSX } from "solid-js";
import { Text } from "../primitives/text/index.ts";
import * as s from "./form-feedback.css.ts";

/** Shared visible and accessible error treatment for form compositions. */
export function FormError(props: { id: string; children: JSX.Element }): JSX.Element {
  return (
    <Text id={props.id} tone="danger" class={s.error}>
      <span class={s.errorIndicator} aria-hidden="true" />
      <span class={s.errorMessage}>
        <span class={s.errorPrefix}>Error: </span>
        {props.children}
      </span>
    </Text>
  );
}
