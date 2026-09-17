import { mergeProps, type JSX } from "solid-js";
import type { TooltipTriggerProps } from "./tooltip.tsx";

const handlers =
  <T extends HTMLElement, E extends Event>(
    first: JSX.EventHandlerUnion<T, E> | undefined,
    second: JSX.EventHandlerUnion<T, E> | undefined,
  ): JSX.EventHandler<T, E> =>
  (event) => {
    for (const handler of [first, second]) {
      if (typeof handler === "function") handler(event);
      else if (handler) handler[0](handler[1], event);
    }
  };

const focusHandlers =
  <T extends HTMLElement>(
    first: JSX.FocusEventHandlerUnion<T, FocusEvent> | undefined,
    second: JSX.FocusEventHandlerUnion<HTMLElement, FocusEvent> | undefined,
  ): JSX.FocusEventHandler<T, FocusEvent> =>
  (event) => {
    for (const handler of [first, second]) {
      if (typeof handler === "function") handler(event);
      else if (handler) handler[0](handler[1], event);
    }
  };

/** Share one control between a tooltip and another interaction, preserving refs and handlers. */
export function withTooltip<T extends HTMLElement>(
  control: JSX.HTMLAttributes<T>,
  tooltip: TooltipTriggerProps,
) {
  return mergeProps(tooltip, control, {
    ref(element: T) {
      if (typeof control.ref === "function") control.ref(element);
      tooltip.ref?.(element);
    },
    onClick: handlers<T, MouseEvent>(control.onClick, tooltip.onClick),
    onPointerDown: handlers<T, PointerEvent>(control.onPointerDown, tooltip.onPointerDown),
    onPointerEnter: handlers<T, PointerEvent>(control.onPointerEnter, tooltip.onPointerEnter),
    onPointerLeave: handlers<T, PointerEvent>(control.onPointerLeave, tooltip.onPointerLeave),
    onFocus: focusHandlers<T>(control.onFocus, tooltip.onFocus),
    onBlur: focusHandlers<T>(control.onBlur, tooltip.onBlur),
  });
}
