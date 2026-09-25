import { splitProps, type JSX } from "solid-js";
import { classes } from "../internal/props.ts";
import * as s from "./drawing.css.ts";

export type DrawingProps = Omit<JSX.SvgSVGAttributes<SVGSVGElement>, "children" | "viewBox"> & {
  /** Name what the drawing shows when it carries meaning; omit it when nearby text already does. */
  label?: string;
};
function frame(props: DrawingProps, children: JSX.Element) {
  const [local, native] = splitProps(props, ["label", "class", "classList"]);
  return (
    <svg
      {...native}
      viewBox="0 0 160 110"
      fill="none"
      role={local.label ? "img" : undefined}
      aria-label={local.label}
      aria-hidden={local.label ? undefined : "true"}
      class={classes(s.root, local.class, local.classList)}
    >
      {children}
    </svg>
  );
}
const seam = { "stroke-dasharray": "7 6", "stroke-linecap": "round" } as const;

/** A thread unravelling and trailing off the edge: a lost connection. */
export function Disconnected(props: DrawingProps) {
  return frame(
    props,
    <>
      <path d="M18 58 H68" class={s.ink} stroke-width="1.6" stroke-linecap="round" />
      <path d="M68 58 H106" class={s.thread} stroke-width="1.5" {...seam} />
      <path
        d="M106 58 C120 58 122 46 132 48 C140 49 141 57 136 58"
        class={s.cloth}
        stroke-width="1.4"
        stroke-linecap="round"
      />
    </>,
  );
}
/** A thread snapped in two, both ends frayed: something failed. Failure reads through shape, not red. */
export function Snapped(props: DrawingProps) {
  return frame(
    props,
    <>
      <path d="M18 50 H60" class={s.ink} stroke-width="1.6" {...seam} />
      <path d="M100 64 H142" class={s.ink} stroke-width="1.6" {...seam} />
      <path
        d="M52 50 C59 47 65 41 71 37 M57 50 C63 52 69 50 74 46 M60 51 C63 54 64 57 63 60 M108 64 C101 67 94 73 89 79 M103 64 C97 62 92 63 87 66 M100 63 C99 59 101 56 104 54"
        class={s.cloth}
        stroke-width="1.2"
        stroke-linecap="round"
      />
    </>,
  );
}
/** A grid of stitch marks with a bare patch at its centre: nothing here. */
export function Bare(props: DrawingProps) {
  return frame(
    props,
    <>
      <path
        d="M29 27 h10 M34 22 v10 M61 27 h10 M66 22 v10 M93 27 h10 M98 22 v10 M125 27 h10 M130 22 v10 M29 55 h10 M34 50 v10 M125 55 h10 M130 50 v10 M29 83 h10 M34 78 v10 M61 83 h10 M66 78 v10 M93 83 h10 M98 78 v10 M125 83 h10 M130 78 v10"
        class={s.cloth}
        stroke-width="1.4"
        stroke-linecap="round"
      />
      <ellipse
        cx="82"
        cy="55"
        rx="27"
        ry="18"
        class={s.ink}
        stroke-width="1.5"
        stroke-dasharray="7 6"
      />
    </>,
  );
}
