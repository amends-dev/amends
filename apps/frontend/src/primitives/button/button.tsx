import { Show, createSignal, onCleanup, onMount, splitProps, type JSX } from "solid-js";
import * as s from "./button.css.ts";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Blocks activation while preserving focus. The caller owns the operation and its outcome. */
  pending?: boolean;
};

function PendingIndicator() {
  let element!: SVGSVGElement;
  const [radius, setRadius] = createSignal(0);
  onMount(() => {
    const measure = () => setRadius(Math.min(element.clientWidth, element.clientHeight) / 2);
    measure();
    // Percentage SVG radii become an ellipse on tall buttons and cross wrapped labels.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });
  return (
    <svg
      ref={(node) => {
        element = node;
      }}
      class={s.pendingIndicator}
      aria-hidden="true"
    >
      <rect width="100%" height="100%" rx={radius()} ry={radius()} class={s.pendingPath} />
    </svg>
  );
}

/** A native button, primary by default. Pending gates clicks; HTML owns keyboard and form semantics. */
export function Button(props: ButtonProps): JSX.Element {
  const [local, native] = splitProps(props, [
    "variant",
    "pending",
    "type",
    "class",
    "classList",
    "children",
    "onClick",
    "aria-busy",
    "aria-disabled",
  ]);
  const click: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
    if (local.pending) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const handler = local.onClick;
    if (typeof handler === "function") handler(event);
    else if (handler) handler[0](handler[1], event);
  };
  const classes = () =>
    [
      s.root,
      s.variants[local.variant ?? "primary"],
      local.class,
      ...Object.entries(local.classList ?? {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
    ]
      .filter(Boolean)
      .join(" ");
  return (
    <button
      {...native}
      type={local.type ?? "button"}
      class={classes()}
      data-pending={local.pending ? "true" : undefined}
      aria-busy={local.pending ? true : local["aria-busy"]}
      aria-disabled={local.pending ? true : local["aria-disabled"]}
      onClick={click}
    >
      {local.children}
      <Show when={local.pending}>
        <PendingIndicator />
      </Show>
    </button>
  );
}
