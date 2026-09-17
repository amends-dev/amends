import { createUniqueId, Show, type JSX } from "solid-js";
import { TextArea } from "./text-field.tsx";
import { Button } from "./button.tsx";
import { Text } from "./text.tsx";
import * as s from "./composer.css.ts";

export interface ComposerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  description: string;
  placeholder?: string;
  modeSwitch?: JSX.Element;
  pending?: boolean;
  disabled?: boolean;
  error?: string;
}

/** Multiline message entry. The caller clears the draft only after a successful submission. */
export function Composer(props: ComposerProps) {
  const id = createUniqueId();
  const blocked = () => !props.value.trim() || props.pending || props.disabled;
  return (
    <form
      class={s.root}
      aria-label={`${props.label} composer`}
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked()) return;
        props.onSubmit();
      }}
    >
      <div class={s.header}>
        <Text as="label" for={id} variant="label" tone="secondary">
          {props.label}
        </Text>
        <Show when={props.modeSwitch}>
          <div class={s.mode}>{props.modeSwitch}</div>
        </Show>
      </div>
      <div class={s.enclosure} data-disabled={props.disabled} data-invalid={!!props.error}>
        <TextArea
          id={id}
          class={s.input}
          value={props.value}
          onInput={(event) => props.onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey) &&
              !event.shiftKey &&
              !event.altKey &&
              !event.isComposing &&
              !event.repeat
            ) {
              event.preventDefault();
              if (!blocked()) event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={props.placeholder ?? "Write a message…"}
          readOnly={props.pending}
          disabled={props.disabled}
          aria-busy={props.pending || undefined}
          aria-describedby={`${id}-note ${id}-shortcut${props.error ? ` ${id}-error` : ""}`}
          aria-invalid={!!props.error}
          rows={3}
        />
        <div class={s.footer}>
          <Text as="span" variant="caption" tone="muted" id={`${id}-shortcut`}>
            Ctrl / ⌘ + Enter to send
          </Text>
          <Button
            class={s.submit}
            type="submit"
            compactIcon="↑"
            disabled={!props.value.trim() || props.disabled}
            pending={!!props.pending}
          >
            {props.submitLabel ?? "send message"}
          </Button>
        </div>
      </div>
      <Text variant="bodySmall" tone="muted" id={`${id}-note`}>
        {props.description}
      </Text>
      <Show when={props.error}>
        <Text variant="bodySmall" tone="danger" id={`${id}-error`} role="alert">
          {props.error}
        </Text>
      </Show>
    </form>
  );
}
