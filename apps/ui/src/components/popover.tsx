import * as Primitive from "@kobalte/core/popover";
import { createSignal, Show, type JSX } from "solid-js";
import type { OverlayTrigger } from "./dropdown-menu.tsx";
import { createOverlayScope } from "./overlay-scope.ts";
import * as s from "./popover.css.ts";
export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  trigger: OverlayTrigger;
  children: JSX.Element;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  /** Explicit page theme for content opened from an inverse navigation rail. */
  theme?: "cotton" | "soot";
}
/** Mixed-content disclosure with normal Tab navigation; choosing a control does not close it. */
export function Popover(props: PopoverProps) {
  const [anchor, setAnchor] = createSignal<HTMLElement>();
  const scope = createOverlayScope(anchor);
  return (
    <Primitive.Root
      open={props.open}
      onOpenChange={props.onOpenChange}
      modal={false}
      placement={props.placement ?? "bottom-start"}
      gutter={8}
      overflowPadding={8}
      fitViewport
    >
      <Primitive.Trigger as={props.trigger} ref={setAnchor} />
      <Show when={scope.mount()}>
        {(mount) => (
          <Primitive.Portal mount={mount()}>
            <div
              data-theme={props.theme ?? scope.scope().theme}
              data-surface={props.theme ? undefined : scope.scope().surface}
            >
              <Primitive.Content class={s.panel} aria-label={props.label}>
                {props.children}
              </Primitive.Content>
            </div>
          </Primitive.Portal>
        )}
      </Show>
    </Primitive.Root>
  );
}
