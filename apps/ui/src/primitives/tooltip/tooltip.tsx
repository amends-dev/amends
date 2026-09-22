import * as Primitive from "@kobalte/core/tooltip";
import {
  createContext,
  createEffect,
  createSignal,
  on,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
  type ValidComponent,
} from "solid-js";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import { createOverlayScope } from "../overlay/scope.ts";
import { classes } from "../internal/props.ts";
import * as s from "./tooltip.css.ts";

export type RootProps = Pick<
  Primitive.TooltipRootProps,
  "children" | "disabled" | "placement" | "open" | "defaultOpen" | "onOpenChange"
>;
const AnchorContext = createContext<{
  anchor: Accessor<HTMLElement | undefined>;
  setAnchor: (element: HTMLElement) => void;
}>();
export function Root(props: RootProps) {
  const [anchor, setAnchor] = createSignal<HTMLElement>();
  return (
    <AnchorContext.Provider value={{ anchor, setAnchor }}>
      <Primitive.Root
        placement="top-start"
        openDelay={400}
        closeDelay={100}
        gutter={8}
        overflowPadding={8}
        fitViewport
        {...props}
      />
    </AnchorContext.Provider>
  );
}
/** Render as Button, IconButton, or a native anchor; one interactive element, never a nested button. */
export function Trigger<T extends ValidComponent = "button">(
  props: PolymorphicProps<T, Primitive.TooltipTriggerProps<T>>,
) {
  const anchor = useContext(AnchorContext);
  if (!anchor) throw new Error("Tooltip.Trigger requires Tooltip.Root");
  const [local, native] = splitProps(
    props as Primitive.TooltipTriggerProps & { as?: ValidComponent },
    ["ref"],
  );
  return (
    <Primitive.Trigger
      {...native}
      ref={(element: HTMLElement) => {
        anchor.setAnchor(element);
        if (typeof local.ref === "function") local.ref(element);
      }}
    />
  );
}
export type ContentProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "children"> & {
  children: string;
};
/** Supplemental, noninteractive text. The trigger must have its own accessible name. */
export function Content(props: ContentProps) {
  const context = Primitive.useTooltipContext();
  const anchor = useContext(AnchorContext);
  if (!anchor) throw new Error("Tooltip.Content requires Tooltip.Root");
  const scope = createOverlayScope(anchor.anchor);
  createEffect(() => {
    if (context.isDisabled()) context.hideTooltip(true);
  });
  createEffect(on(scope.mount, () => context.hideTooltip(true), { defer: true }));
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <Primitive.Portal mount={scope.mount()}>
      <div style={scope.style()} dir={scope.direction()}>
        <Primitive.Content {...native} class={classes(s.content, local.class, local.classList)} />
      </div>
    </Primitive.Portal>
  );
}
