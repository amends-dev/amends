import { Show } from "solid-js";
import { StatusIndicator, type StatusTone } from "./status-indicator.tsx";
import { Text } from "./text.tsx";
import { Identity, type IdentityData } from "./identity.tsx";
import * as s from "./task-reference.css.ts";

export function TaskReference(props: {
  href: string;
  title: string;
  status: string;
  tone: StatusTone;
  owner?: IdentityData | null;
}) {
  return (
    <a class={s.root} href={props.href}>
      <Text as="strong" variant="bodySmall" tone="primary">
        {props.title}
      </Text>
      <Text as="span" variant="caption" tone="muted" class={s.meta}>
        <StatusIndicator tone={props.tone} decorative />
        task · {props.status}
        <Show when={props.owner === null}> · unassigned</Show>
        <Show when={props.owner}>
          {(owner) => (
            <>
              {" "}
              · <Identity {...owner()} size="compact" />
            </>
          )}
        </Show>
      </Text>
    </a>
  );
}
