import { Text } from "./text.tsx";
import { children, createUniqueId, Show, type JSX } from "solid-js";
import * as s from "./section.css.ts";
export interface SectionProps {
  title: string;
  count?: JSX.Element;
  note?: JSX.Element;
  children: JSX.Element;
}
export function Section(props: SectionProps) {
  const countSlot = children(() => props.count);
  const noteSlot = children(() => props.note);
  const id = createUniqueId();
  return (
    <section class={s.root} aria-labelledby={id}>
      <div class={s.header}>
        <Text as="h2" variant="label" id={id} class={s.title}>
          {props.title}
        </Text>
        <Show when={countSlot() !== undefined}>
          <Text as="span" variant="caption">
            {countSlot()}
          </Text>
        </Show>
        <span class={s.seam} aria-hidden="true" />
        <Show when={noteSlot()}>
          <Text as="span" variant="caption" class={s.note}>
            {noteSlot()}
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
