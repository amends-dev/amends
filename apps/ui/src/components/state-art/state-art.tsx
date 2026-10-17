import { For, Match, Switch, type JSX } from "solid-js"
import { classes } from "../../internal/props.ts"
import * as s from "./state-art.css.ts"

/**
 * The mark's empty and error states, each drawn from its own parts.
 * Empty states are outlines waiting to be filled; errors are stitches that came undone.
 *
 * - `sew-in`: a new piece sewn in beside empty outlines, for a first thing to make.
 * - `reach`: a thread reaching for an empty outline, for nothing connected yet.
 * - `fill`: an outline filling in, for a place waiting for its first thing.
 * - `caret`: a stitch blinking on a seam, for nothing said yet.
 * - `rest`: the mark breathing, for nothing left to do.
 * - `came-apart`: the patch swinging loose, for something that failed.
 * - `lost-thread`: the thread between two pieces snapping back, for something out of reach.
 * - `nothing-here`: a scan across an empty hole, for something that isn't there.
 * - `held-back`: the patch straining at its stitches, for access the reader lacks.
 */
export type StateArtKind =
  | "sew-in"
  | "reach"
  | "fill"
  | "caret"
  | "rest"
  | "came-apart"
  | "lost-thread"
  | "nothing-here"
  | "held-back"

export interface StateArtProps {
  readonly kind: StateArtKind
  readonly class?: string
}

const wide = new Set<StateArtKind>(["sew-in", "reach", "lost-thread"])
// The four stitches across the seam, as the mark draws them.
const stitches = ["M18.5 37 H25.5", "M18.5 30 H25.5", "M30 18.5 V25.5", "M37 18.5 V25.5"]

const Base = () => <rect class={s.ink} x="3" y="3" width="42" height="42" />
const Patch = (props: { readonly class?: string }) => (
  <g class={props.class}>
    <rect class={s.patch} x="22" y="22" width="39" height="39" />
  </g>
)
const Stitches = (props: { readonly class?: string; readonly paths?: ReadonlyArray<string> }) => (
  <For each={props.paths ?? stitches}>{(d) => <path class={classes(s.knockLine, props.class)} d={d} />}</For>
)
const Ghost = (props: { readonly x: number; readonly y: number; readonly size: number }) => (
  <rect class={s.ghost} x={props.x} y={props.y} width={props.size} height={props.size} />
)

/** An animated state from the mark, decorative beside the words that name the state. */
export function StateArt(props: StateArtProps): JSX.Element {
  return (
    <svg
      class={classes(s.art, props.class)}
      viewBox={wide.has(props.kind) ? "0 0 120 64" : "0 0 64 64"}
      aria-hidden="true"
    >
      <Switch>
        <Match when={props.kind === "sew-in"}>
          <Ghost x={8} y={17} size={30} />
          <Ghost x={45} y={17} size={30} />
          <g class={s.sewingIn}>
            <rect class={s.ink} x="82" y="17" width="30" height="30" />
            <path class={s.knockLine} d="M90 22 V29 M100 22 V29" />
          </g>
        </Match>
        <Match when={props.kind === "reach"}>
          <rect class={s.ink} x="8" y="17" width="30" height="30" />
          <Ghost x={82} y={17} size={30} />
          <path class={classes(s.inkLine, s.guide)} d="M40 32 H80" />
          <path class={classes(s.inkLine, s.reaching)} d="M40 32 H80" />
        </Match>
        <Match when={props.kind === "fill"}>
          <Ghost x={4} y={4} size={56} />
          <rect class={classes(s.ink, s.filling)} x="22" y="22" width="20" height="20" />
        </Match>
        <Match when={props.kind === "caret"}>
          <path class={classes(s.inkLine, s.seam)} d="M14 8 V56" />
          <path class={classes(s.inkLine, s.caret)} d="M14 32 H46" />
        </Match>
        <Match when={props.kind === "rest"}>
          <Base />
          <Patch class={s.breathing} />
          <Stitches />
        </Match>
        <Match when={props.kind === "came-apart"}>
          <Base />
          <Patch class={s.swinging} />
          <Stitches paths={stitches.slice(2)} />
          <path class={classes(s.knockLine, s.fraying)} d="M18.5 30 H22" />
          <path class={classes(s.knockLine, s.frayingLate)} d="M18.5 37 H21.5" />
        </Match>
        <Match when={props.kind === "lost-thread"}>
          <rect class={s.ink} x="8" y="17" width="30" height="30" />
          <rect class={s.ink} x="82" y="17" width="30" height="30" />
          <path class={classes(s.inkLine, s.recoilingStart)} d="M40 32 H55" />
          <path class={classes(s.inkLine, s.recoilingEnd)} d="M65 32 H80" />
        </Match>
        <Match when={props.kind === "nothing-here"}>
          <rect class={s.ink} x="4" y="4" width="56" height="56" />
          <rect class={s.knock} x="21" y="21" width="22" height="22" />
          <path class={classes(s.inkLine, s.scanning)} d="M25 32 H39" />
        </Match>
        <Match when={props.kind === "held-back"}>
          <Base />
          <Patch class={s.pulling} />
          <Stitches class={s.tautening} />
        </Match>
      </Switch>
    </svg>
  )
}
