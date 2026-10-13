import { Show, createUniqueId, splitProps, type JSX } from "solid-js"

export const iconSizes = { xs: "0.75rem", sm: "1rem", md: "1.25rem", lg: "1.5rem" } as const
export const iconWeights = [1.5, 1.75, 2] as const
export type IconSize = keyof typeof iconSizes | number
export type IconWeight = (typeof iconWeights)[number]

export type IconProps = Omit<
  JSX.SvgSVGAttributes<SVGSVGElement>,
  | "children"
  | "innerHTML"
  | "textContent"
  | "viewBox"
  | "width"
  | "height"
  | "fill"
  | "stroke"
  | "stroke-width"
  | "stroke-linecap"
  | "stroke-linejoin"
  | "role"
  | "aria-hidden"
  | "aria-label"
  | "aria-labelledby"
  | "tabindex"
  | "tabIndex"
  | "focusable"
> & {
  /** Named sizes scale with root text; numbers are explicit CSS pixels. Default md. */
  size?: IconSize
  /** Stroke width on the 24-unit canvas, independent of rendered size. Default 2. */
  weight?: IconWeight
  /** Omit for decorative icons, including glyphs inside a named button. */
  label?: string
}

/** Private rendering contract shared by generated icons. */
export function IconSvg(props: IconProps & { children: JSX.Element }): JSX.Element {
  const [local, native] = splitProps(props, ["size", "weight", "label", "children"])
  const titleId = createUniqueId()
  const label = () => local.label?.trim()
  const dimension = () => {
    const size = local.size ?? "md"
    return typeof size === "number" ? size : iconSizes[size]
  }
  return (
    <svg
      {...native}
      xmlns="http://www.w3.org/2000/svg"
      width={dimension()}
      height={dimension()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={local.weight ?? 2}
      stroke-linecap="round"
      stroke-linejoin="round"
      tabIndex={undefined}
      role={label() ? "img" : undefined}
      aria-hidden={label() ? undefined : true}
      aria-label={undefined}
      aria-labelledby={label() ? titleId : undefined}
    >
      <Show when={label()}>{(name) => <title id={titleId}>{name()}</title>}</Show>
      {local.children}
    </svg>
  )
}
