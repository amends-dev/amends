import * as Primitive from "@kobalte/core/tooltip";
import { Show, createSignal, type JSX } from "solid-js";
import { classes } from "../../internal/props.ts";
import { overlayMount } from "../../internal/overlay.ts";
import * as s from "./tooltip.css.ts";

export type TooltipProps = {
  /** The words, such as "Needs setup". */
  title: string;
  /** Why, in a sentence. */
  detail?: string;
  /** Colors the title as a status. */
  tone?: "success" | "caution" | "danger";
  /** What the pointer rests on, such as a status mark. */
  children: JSX.Element;
  class?: string;
};

/**
 * A short label on hover, for a mark whose meaning has no room beside it. The trigger is a span,
 * so it can sit inside a link; the words must also reach assistive technology some other way,
 * such as the mark's label or visually hidden text, since hover alone does not.
 */
export function Tooltip(props: TooltipProps) {
  const [trigger, setTrigger] = createSignal<HTMLElement>();
  return (
    <Primitive.Root openDelay={300} closeDelay={0} placement="top" gutter={6}>
      <Primitive.Trigger as="span" ref={setTrigger} class={classes(s.trigger, props.class)}>
        {props.children}
      </Primitive.Trigger>
      <Primitive.Portal mount={overlayMount(trigger())}>
        <Primitive.Content class={s.content}>
          <span class={s.title} data-tone={props.tone}>
            {props.title}
          </span>
          <Show when={props.detail}>{(detail) => <span class={s.detail}>{detail()}</span>}</Show>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
