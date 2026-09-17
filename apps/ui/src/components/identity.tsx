import { Show, mergeProps, type JSX } from "solid-js";
import { Text } from "./text.tsx";
import { Tooltip, type TooltipTriggerProps } from "./tooltip.tsx";
import * as s from "./identity.css.ts";

export interface IdentityData {
  name: string;
  kind: "user" | "agent" | "contact" | "system";
}

export interface IdentityProps extends IdentityData {
  size?: "compact" | "small" | "medium" | "large";
  compact?: boolean;
  /** In compact mode, attach the tooltip to the enclosing button or link without nesting controls. */
  trigger?: (props: TooltipTriggerProps) => JSX.Element;
}

/** A principal's badge and name; compact badges reveal the name on hover or keyboard focus. */
export function Identity(props: IdentityProps) {
  const initials = () =>
    props.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0] ?? "")
      .join("")
      .toUpperCase() || "?";
  const badge = () => (
    <span
      class={s.badge}
      data-size={props.size ?? "small"}
      data-kind={props.kind}
      aria-hidden="true"
    >
      {initials()}
    </span>
  );
  const labeled = () => (
    <span class={s.root} data-identity={props.kind}>
      {badge()}
      <Text as="span" variant="inherit" class={s.name}>
        {props.name}
      </Text>
    </span>
  );
  return (
    <Show when={props.compact || props.trigger} fallback={labeled()}>
      <Tooltip
        content={props.name}
        disabled={!props.compact}
        trigger={(trigger) =>
          props.trigger ? (
            props.trigger(
              mergeProps(trigger, {
                get children() {
                  return (
                    <Show when={props.compact} fallback={labeled()}>
                      {badge()}
                    </Show>
                  );
                },
              }),
            )
          ) : (
            <span
              {...trigger}
              class={s.compact}
              data-identity={props.kind}
              role="img"
              aria-label={props.name}
              tabIndex={0}
            >
              {badge()}
            </span>
          )
        }
      />
    </Show>
  );
}
