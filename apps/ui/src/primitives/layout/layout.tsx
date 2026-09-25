import { splitProps, type JSX, type Ref } from "solid-js";
import { Dynamic } from "solid-js/web";
import { space, type SpaceStep } from "../../foundations/spacing/tokens.ts";
import * as s from "./layout.css.ts";

export type LayoutElement =
  | "div"
  | "section"
  | "main"
  | "aside"
  | "header"
  | "footer"
  | "nav"
  | "form"
  | "ul"
  | "ol"
  | "li";
/** Explicit lengths keep intrinsic keywords and percentages out of grid track calculations. */
export type LayoutLength = `${number}rem` | `${number}px` | `${number}ch`;
export type LayoutAlign = "start" | "center" | "end" | "stretch" | "baseline";
export type LayoutJustify = "start" | "center" | "end" | "between";
export type GridColumns = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

type NativeLayoutProps<T extends LayoutElement> = {
  as?: T;
  ref?: Ref<HTMLElementTagNameMap[NoInfer<T>]>;
} & Omit<JSX.IntrinsicElements[NoInfer<T>], "as" | "ref">;
export type ContainerProps<T extends LayoutElement = "div"> = NativeLayoutProps<T> & {
  /** Maximum outer width, including gutters. Defaults to 67.5rem (1080px at the normal root). */
  maxWidth?: LayoutLength | "none";
  /** Inline padding from the spacing scale. Defaults to step 4. */
  gutter?: SpaceStep;
  /** Align a bounded region to the reading edge instead of centering it. */
  align?: "start" | "center";
};
type StackOptions = { gap?: SpaceStep; align?: LayoutAlign; justify?: LayoutJustify };
export type RowProps<T extends LayoutElement = "div"> = NativeLayoutProps<T> &
  StackOptions & {
    /** Content-sized items wrap by default. */
    wrap?: boolean;
  };
export type ColumnProps<T extends LayoutElement = "div"> = NativeLayoutProps<T> & StackOptions;
export type GridProps<T extends LayoutElement = "div"> = NativeLayoutProps<T> & {
  gap?: SpaceStep;
  align?: Exclude<LayoutAlign, "baseline">;
  /** Preferred minimum track width. Clamps to the available width in narrow containers. */
  minColumnWidth?: LayoutLength;
  /** Optional upper limit; the grid uses fewer columns when space is limited. */
  maxColumns?: GridColumns;
};
export type GridItemProps<T extends LayoutElement = "div"> = NativeLayoutProps<T> & {
  /** full spans the current row at every available width. */
  span?: "auto" | "full";
};

function mergeStyle(
  variables: Record<string, string>,
  style: JSX.CSSProperties | string | undefined,
): JSX.CSSProperties | string {
  if (typeof style === "string")
    return `${Object.entries(variables)
      .map(([key, value]) => `${key}:${value}`)
      .join(";")};${style}`;
  return { ...variables, ...style };
}
type BoxNative = JSX.HTMLAttributes<HTMLElement> & { as?: LayoutElement };
function Box(
  props: BoxNative & {
    layoutClass: string;
    variables?: Record<string, string>;
  },
): JSX.Element {
  const [local, native] = splitProps(props, [
    "as",
    "layoutClass",
    "variables",
    "class",
    "classList",
    "style",
  ]);
  const classes = () =>
    [
      local.layoutClass,
      local.class,
      ...Object.entries(local.classList ?? {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
    ]
      .filter(Boolean)
      .join(" ");
  // Public props pair native attributes/ref with `as`; Dynamic needs the common HTML shape.
  return (
    <Dynamic<LayoutElement>
      {...(native as JSX.HTMLAttributes<HTMLElement>)}
      component={local.as ?? "div"}
      class={classes()}
      style={mergeStyle(local.variables ?? {}, local.style)}
    />
  );
}
const align = (value: LayoutAlign) =>
  value === "start" ? "flex-start" : value === "end" ? "flex-end" : value;
const justify = (value: LayoutJustify) => (value === "between" ? "space-between" : align(value));

/** Centered width boundary with token-based inline gutters; no surface or vertical spacing. */
export function Container<T extends LayoutElement = "div">(props: ContainerProps<T>): JSX.Element {
  const [local, native] = splitProps(props, ["maxWidth", "gutter", "align"]);
  return (
    <Box
      {...(native as BoxNative)}
      layoutClass={s.container}
      data-align={local.align ?? "center"}
      variables={{
        [s.properties.maxWidth]: local.maxWidth ?? "67.5rem",
        [s.properties.gutter]: space[local.gutter ?? 4],
      }}
    />
  );
}
/** Horizontal content-sized grouping. Use Grid for equal-width fields. */
export function Row<T extends LayoutElement = "div">(props: RowProps<T>): JSX.Element {
  const [local, native] = splitProps(props, ["gap", "align", "justify", "wrap"]);
  return (
    <Box
      {...(native as BoxNative)}
      layoutClass={s.row}
      variables={{
        [s.properties.gap]: space[local.gap ?? 4],
        [s.properties.align]: align(local.align ?? "center"),
        [s.properties.justify]: justify(local.justify ?? "start"),
        [s.properties.wrap]: local.wrap === false ? "nowrap" : "wrap",
      }}
    />
  );
}
/** Vertical grouping with stretch alignment and token-based gaps. */
export function Column<T extends LayoutElement = "div">(props: ColumnProps<T>): JSX.Element {
  const [local, native] = splitProps(props, ["gap", "align", "justify"]);
  return (
    <Box
      {...(native as BoxNative)}
      layoutClass={s.column}
      variables={{
        [s.properties.gap]: space[local.gap ?? 4],
        [s.properties.align]: align(local.align ?? "stretch"),
        [s.properties.justify]: justify(local.justify ?? "start"),
      }}
    />
  );
}
/** Equal-width columns that respond to their container using CSS alone. */
export function Grid<T extends LayoutElement = "div">(props: GridProps<T>): JSX.Element {
  const [local, native] = splitProps(props, ["gap", "align", "minColumnWidth", "maxColumns"]);
  const minimum = () => local.minColumnWidth ?? "15rem";
  const track = () =>
    local.maxColumns === undefined
      ? minimum()
      : `max(${minimum()}, calc((100% - ${local.maxColumns - 1} * ${space[local.gap ?? 4]}) / ${local.maxColumns}))`;
  return (
    <Box
      {...(native as BoxNative)}
      layoutClass={s.grid}
      variables={{
        [s.properties.gap]: space[local.gap ?? 4],
        [s.properties.align]: local.align ?? "start",
        [s.properties.track]: track(),
      }}
    />
  );
}
/** Optional wrapper for a full-width row or native item attributes; ordinary children need no wrapper. */
export function GridItem<T extends LayoutElement = "div">(props: GridItemProps<T>): JSX.Element {
  const [local, native] = splitProps(props, ["span"]);
  return (
    <Box
      {...(native as BoxNative)}
      layoutClass={`${s.item}${local.span === "full" ? ` ${s.full}` : ""}`}
    />
  );
}
