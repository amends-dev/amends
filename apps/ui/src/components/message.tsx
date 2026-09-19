import { Text } from "./text.tsx";
import { Identity, type IdentityData } from "./identity.tsx";
import { children, Show } from "solid-js";
import type { JSX } from "solid-js";
import * as s from "./message.css.ts";
export function Message(props: {
  kind?: IdentityData["kind"];
  id?: string;
  tabIndex?: number;
  author: string;
  role?: string;
  time: string;
  dateTime?: string;
  direction?: "in" | "here" | "out";
  children: JSX.Element;
  footer?: JSX.Element;
  delivery?: JSX.Element;
}) {
  const footerSlot = children(() => props.footer);
  return (
    <article
      class={s.root}
      id={props.id}
      tabIndex={props.tabIndex}
      aria-label={`Message from ${props.author}`}
    >
      <div class={s.content}>
        <div class={s.header}>
          <Text as="strong" variant="bodySmall" tone="primary">
            <Identity name={props.author} kind={props.kind ?? "user"} size="small" />
          </Text>
          <Text as="span" variant="caption">
            {props.role}
          </Text>
          <Text as="time" variant="caption" dateTime={props.dateTime}>
            {props.time}
          </Text>
          <Show when={props.direction}>
            <Text as="span" variant="caption">
              {props.direction === "in"
                ? "Inbound"
                : props.direction === "out"
                  ? "Outbound"
                  : "Internal"}
            </Text>
          </Show>
          {props.delivery}
        </div>
        <Text as="div" variant="body" class={s.body}>
          {props.children}
        </Text>
        <Show when={footerSlot()}>
          <div class={s.footer}>{footerSlot()}</div>
        </Show>
      </div>
    </article>
  );
}
