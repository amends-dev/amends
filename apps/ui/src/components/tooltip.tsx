import * as Primitive from "@kobalte/core/tooltip";
import { createSignal, Show, type JSX } from "solid-js";
import { createOverlayScope } from "./overlay-scope.ts";
import * as s from "./menu.css.ts";
export type TooltipTriggerProps = Omit<JSX.HTMLAttributes<HTMLElement>, "ref"> & {
  ref?: (element: HTMLElement) => void;
};
export interface TooltipProps {
  /** Supplemental text, never the trigger's only accessible name. No interactive content. */
  content: string;
  trigger: (props: TooltipTriggerProps) => JSX.Element;
  placement?: "top" | "top-start" | "bottom" | "bottom-start" | "left" | "right";
  disabled?: boolean;
}
/** Appears on keyboard focus or delayed hover; remains hoverable and dismisses on Escape. */
export function Tooltip(props: TooltipProps) {
  const [anchor, setAnchor] = createSignal<HTMLElement>();
  const scope = createOverlayScope(anchor);
  return (
    <Primitive.Root
      placement={props.placement ?? "top-start"}
      openDelay={500}
      closeDelay={150}
      gutter={8}
      overflowPadding={8}
      fitViewport
      disabled={props.disabled ?? false}
    >
      <Primitive.Trigger as={props.trigger} ref={setAnchor} />
      <Show when={scope.mount()}>
        {(mount) => (
          <Primitive.Portal mount={mount()}>
            <div data-theme={scope.scope().theme} data-surface={scope.scope().surface}>
              <Primitive.Content class={s.tooltip} data-surface="inverse">
                {props.content}
              </Primitive.Content>
            </div>
          </Primitive.Portal>
        )}
      </Show>
    </Primitive.Root>
  );
}
