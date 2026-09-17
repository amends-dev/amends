import { Show, splitProps, type JSX } from "solid-js";
import { runningStitch } from "../styles/stitch.css.ts";
import * as s from "./button.css.ts";

export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  tone?: "neutral" | "danger";
  size?: "compact" | "regular" | "touch";
  /** Blocks activation while retaining focus. The caller owns the async operation and its outcome announcement. */
  pending?: boolean;
  compactIcon?: JSX.Element;
};

type ControlProps = ButtonProps & { icon?: boolean };
function ButtonControl(props: ControlProps) {
  const [local, rest] = splitProps(props, [
    "compactIcon",
    "variant",
    "tone",
    "size",
    "pending",
    "icon",
    "class",
    "children",
    "onClick",
    "type",
    "disabled",
    "aria-disabled",
    "aria-busy",
  ]);
  const blocked = () =>
    local.disabled ||
    local.pending ||
    local["aria-disabled"] === true ||
    local["aria-disabled"] === "true";
  const click: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
    if (blocked()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const handler = local.onClick;
    if (typeof handler === "function") handler(event);
    else if (handler) handler[0](handler[1], event);
  };
  return (
    <button
      {...rest}
      type={local.type ?? "button"}
      disabled={local.disabled}
      aria-disabled={blocked() || undefined}
      aria-busy={local.pending || local["aria-busy"]}
      class={`${s.button({ variant: local.variant, tone: local.tone, size: local.size, icon: local.icon })} ${s.disabled} ${local.class ?? ""}`}
      data-compact={local.compactIcon ? "true" : undefined}
      onClick={click}
    >
      <Show when={local.compactIcon} fallback={local.children}>
        <span class={s.compactLabel}>{local.children}</span>
        <span class={s.compactIcon} aria-hidden="true">
          {local.compactIcon}
        </span>
      </Show>
      <Show when={local.pending}>
        <svg class={s.pending} aria-hidden="true">
          <rect width="100%" height="100%" ry="50%" class={`${runningStitch} ${s.pendingPath}`} />
        </svg>
      </Show>
    </button>
  );
}

/** Native button; defaults to type="button". Pending keeps its accessible name and focus stable. */
export function Button(props: ButtonProps) {
  return <ButtonControl {...props} />;
}

export type IconButtonProps = Omit<ButtonProps, "aria-label" | "aria-labelledby"> & {
  label: string;
};
/** An icon-only action must have an explicit accessible label. Icon contents are decorative. */
export function IconButton(props: IconButtonProps) {
  const [local, rest] = splitProps(props, ["label", "children"]);
  return (
    <ButtonControl {...rest} icon aria-label={local.label}>
      <span class={s.iconContent} aria-hidden="true">
        {local.children}
      </span>
    </ButtonControl>
  );
}
