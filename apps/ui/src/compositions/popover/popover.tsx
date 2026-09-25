import * as Primitive from "@kobalte/core/popover";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
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
import { Button, type ButtonProps } from "../../primitives/button/index.ts";
import { callHandler, classes } from "../../primitives/internal/props.ts";
import { createOverlayScope } from "../../primitives/overlay/scope.ts";
import * as s from "./popover.css.ts";

export type RootProps = Pick<
  Primitive.PopoverRootProps,
  "children" | "open" | "defaultOpen" | "onOpenChange" | "placement"
>;
const AnchorContext = createContext<{
  anchor: Accessor<HTMLElement | undefined>;
  setAnchor: (element: HTMLElement) => void;
}>();

/** A nonmodal, anchored dialog for content supplied by the caller. */
export function Root(props: RootProps) {
  const [anchor, setAnchor] = createSignal<HTMLElement>();
  return (
    <AnchorContext.Provider value={{ anchor, setAnchor }}>
      <Primitive.Root
        modal={false}
        placement="bottom-start"
        gutter={8}
        overflowPadding={8}
        fitViewport
        {...props}
      />
    </AnchorContext.Provider>
  );
}

/** Render as Button, IconButton, or a native button without nesting controls. */
export function Trigger<T extends ValidComponent = "button">(
  props: PolymorphicProps<T, Primitive.PopoverTriggerProps<T>>,
) {
  const anchor = useContext(AnchorContext);
  if (!anchor) throw new Error("Popover.Trigger requires Popover.Root");
  const [local, native] = splitProps(
    props as Primitive.PopoverTriggerProps & { as?: ValidComponent },
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

export type ContentProps = Omit<
  PolymorphicProps<"div", Primitive.PopoverContentProps<"div">>,
  "tabIndex"
> & { size?: "regular" | "wide" };
/** Portaled surface that inherits its trigger's colors and direction. Give it a Title or aria-label. */
export function Content(props: ContentProps) {
  const context = Primitive.usePopoverContext();
  const anchor = useContext(AnchorContext);
  if (!anchor) throw new Error("Popover.Content requires Popover.Root");
  const scope = createOverlayScope(anchor.anchor);
  createEffect(on(scope.mount, () => context.close(), { defer: true }));
  const [local, native] = splitProps(props, ["class", "classList", "size"]);
  return (
    <Primitive.Portal mount={scope.mount()}>
      <div style={scope.style()} dir={scope.direction()}>
        <Primitive.Content
          {...native}
          data-size={local.size ?? "regular"}
          tabIndex={0}
          class={classes(s.content, local.class, local.classList)}
        />
      </div>
    </Primitive.Portal>
  );
}

export function Title(props: JSX.HTMLAttributes<HTMLHeadingElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <Primitive.Title {...native} class={classes(s.title, local.class, local.classList)} />;
}

export function Description(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <Primitive.Description
      {...native}
      class={classes(s.description, local.class, local.classList)}
    />
  );
}

/** A regular Button that closes after a non-cancelled activation. */
export function Close(props: ButtonProps) {
  const context = Primitive.usePopoverContext();
  const [local, native] = splitProps(props, ["onClick"]);
  return (
    <Button
      {...native}
      onClick={(event) => {
        callHandler(local.onClick, event);
        if (!event.defaultPrevented) context.close();
      }}
    />
  );
}
