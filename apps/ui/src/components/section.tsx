import { Text } from "./text.tsx";
import { createUniqueId, Show, type JSX } from "solid-js";
import * as s from "./section.css.ts";
export interface SectionProps {
  title: string;
  count?: JSX.Element;
  note?: JSX.Element;
  children: JSX.Element;
}
export function Section(props: SectionProps) {
  const id = createUniqueId();
  return (
    <section class={s.root} aria-labelledby={id}>
      <div class={s.header}>
        <Text as="h2" variant="label" id={id} class={s.title}>
          {props.title}
        </Text>
        <Show when={props.count !== undefined}>
          <Text as="span" variant="caption">
            {props.count}
          </Text>
        </Show>
        <span class={s.seam} aria-hidden="true" />
        <Show when={props.note}>
          <Text as="span" variant="caption" class={s.note}>
            {props.note}
          </Text>
        </Show>
      </div>
      {props.children}
    </section>
  );
}
export function SectionStack(props: { children: JSX.Element }) {
  return <div class={s.stack}>{props.children}</div>;
}
