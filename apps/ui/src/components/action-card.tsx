import { Text } from "./text.tsx";
import { Show, type JSX } from "solid-js";
import * as s from "./action-card.css.ts";
export interface ActionCardProps {
  label: string;
  status: JSX.Element;
  metadata?: JSX.Element;
  title?: string;
  quote?: string;
  children?: JSX.Element;
  actions: JSX.Element;
}
export function ActionCard(props: ActionCardProps) {
  return (
    <article class={s.root} aria-label={props.label}>
      <div class={s.header}>
        {props.status}
        <Text as="span" variant="caption" class={s.metadata}>
          {props.metadata}
        </Text>
      </div>
      <Show when={props.title}>
        <Text as="h3" variant="title">
          {props.title}
        </Text>
      </Show>
      <Show when={props.quote}>
        <Text as="blockquote" variant="quote">
          {props.quote}
        </Text>
      </Show>
      <Show when={props.children}>
        <Text as="div" variant="bodySmall" tone="secondary">
          {props.children}
        </Text>
      </Show>
      <div class={s.actions}>{props.actions}</div>
    </article>
  );
}
