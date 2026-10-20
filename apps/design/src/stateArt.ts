/**
 * The mark's empty and error states, each drawn from its own parts and moving: empty states are outlines waiting
 * to be filled, and errors are stitches that came undone.
 */

import type { Html, HtmlBuilder } from "foldkit/html"
import { stitchPaths } from "./logo.ts"

/**
 * The nine states and what each says:
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
export const stateArtKinds = [
  "sew-in",
  "reach",
  "fill",
  "caret",
  "rest",
  "came-apart",
  "lost-thread",
  "nothing-here",
  "held-back"
] as const

export type StateArtKind = (typeof stateArtKinds)[number]

const artLook = "block h-18 flex-none overflow-visible"

const inkFill = "fill-current"

const inkLine = "fill-none stroke-current [stroke-width:2.4]"

const knockFill = "fill-status-knockout"

const knockLine = "fill-none stroke-status-knockout [stroke-width:2.4] [stroke-linecap:square]"

const patchLook = "fill-current stroke-status-knockout [stroke-width:2.6]"

const ghostLook = "fill-none stroke-current opacity-38 [stroke-width:2.4] [stroke-dasharray:6_5] [stroke-linecap:round]"

const guideLook = `${inkLine} opacity-16 [stroke-dasharray:5_5]`

const seamLook = `${inkLine} opacity-28 [stroke-dasharray:6_6]`

const caretLook = "fill-none stroke-current [stroke-width:2.6] art-caret"

/** The kinds drawn on 120 units across, the rest on 64: two pieces side by side with a thread between them. */
const wideKinds: ReadonlyArray<StateArtKind> = ["sew-in", "reach", "lost-thread"]

type Builder<Message, Requirements> = HtmlBuilder<Message, Requirements>

const square = <Message, Requirements>(
  h: Builder<Message, Requirements>,
  look: string,
  at: Readonly<{ x: number; y: number; size: number }>
): Html => h.rect([h.Class(look), h.X(`${at.x}`), h.Y(`${at.y}`), h.Width(`${at.size}`), h.Height(`${at.size}`)])

const line = <Message, Requirements>(h: Builder<Message, Requirements>, look: string, path: string): Html =>
  h.path([h.Class(look), h.D(path)])

/** The mark's square. */
const base = <Message, Requirements>(h: Builder<Message, Requirements>): Html =>
  square(h, inkFill, { x: 3, y: 3, size: 42 })

/** The mark's patch over the square's corner, in a group so that a motion can carry it. */
const patch = <Message, Requirements>(h: Builder<Message, Requirements>, motion: string): Html =>
  h.g([h.Class(motion)], [square(h, patchLook, { x: 22, y: 22, size: 39 })])

/** The mark's stitches, each in the `look` given, of the `paths` given. */
const stitches = <Message, Requirements>(
  h: Builder<Message, Requirements>,
  look: string,
  paths: ReadonlyArray<string> = stitchPaths
): ReadonlyArray<Html> => paths.map((path) => line(h, look, path))

const drawings = {
  "sew-in": <Message, Requirements>(h: Builder<Message, Requirements>) => [
    square(h, ghostLook, { x: 8, y: 17, size: 30 }),
    square(h, ghostLook, { x: 45, y: 17, size: 30 }),
    h.g(
      [h.Class("art-sewing-in")],
      [square(h, inkFill, { x: 82, y: 17, size: 30 }), line(h, knockLine, "M90 22 V29 M100 22 V29")]
    )
  ],
  reach: <Message, Requirements>(h: Builder<Message, Requirements>) => [
    square(h, inkFill, { x: 8, y: 17, size: 30 }),
    square(h, ghostLook, { x: 82, y: 17, size: 30 }),
    line(h, guideLook, "M40 32 H80"),
    line(h, `${inkLine} art-reaching`, "M40 32 H80")
  ],
  fill: <Message, Requirements>(h: Builder<Message, Requirements>) => [
    square(h, ghostLook, { x: 4, y: 4, size: 56 }),
    square(h, `${inkFill} art-filling`, { x: 22, y: 22, size: 20 })
  ],
  caret: <Message, Requirements>(h: Builder<Message, Requirements>) => [
    line(h, seamLook, "M14 8 V56"),
    line(h, caretLook, "M14 32 H46")
  ],
  rest: <Message, Requirements>(h: Builder<Message, Requirements>) => [
    base(h),
    patch(h, "art-breathing"),
    ...stitches(h, knockLine)
  ],
  "came-apart": <Message, Requirements>(h: Builder<Message, Requirements>) => [
    base(h),
    patch(h, "art-swinging"),
    ...stitches(h, knockLine, stitchPaths.slice(2)),
    line(h, `${knockLine} art-fraying`, "M18.5 30 H22"),
    line(h, `${knockLine} art-fraying-late`, "M18.5 37 H21.5")
  ],
  "lost-thread": <Message, Requirements>(h: Builder<Message, Requirements>) => [
    square(h, inkFill, { x: 8, y: 17, size: 30 }),
    square(h, inkFill, { x: 82, y: 17, size: 30 }),
    line(h, `${inkLine} art-recoiling-start`, "M40 32 H55"),
    line(h, `${inkLine} art-recoiling-end`, "M65 32 H80")
  ],
  "nothing-here": <Message, Requirements>(h: Builder<Message, Requirements>) => [
    square(h, inkFill, { x: 4, y: 4, size: 56 }),
    square(h, knockFill, { x: 21, y: 21, size: 22 }),
    line(h, `${inkLine} art-scanning`, "M25 32 H39")
  ],
  "held-back": <Message, Requirements>(h: Builder<Message, Requirements>) => [
    base(h),
    patch(h, "art-pulling"),
    ...stitches(h, `${knockLine} art-tautening`)
  ]
} as const satisfies Record<
  StateArtKind,
  <Message, Requirements>(h: Builder<Message, Requirements>) => ReadonlyArray<Html>
>

/**
 * An animated state drawn from the mark, 4.5rem tall: 64 units across, or 120 for `sew-in`, `reach`, and
 * `lost-thread`, which show two pieces and the thread between them. It takes the color of the text around it, with
 * its patch and stitches cut out of `status-knockout`, the surface behind it, and it is decorative: hidden from
 * assistive technology, beside the words that name the state. Each motion stills when the reader prefers less
 * motion, with the loose patch and the frayed stitches resting partway, so that the break still reads.
 */
export const stateArt = <Message, Requirements>(h: Builder<Message, Requirements>, kind: StateArtKind): Html =>
  h.svg(
    [
      h.Xmlns("http://www.w3.org/2000/svg"),
      h.ViewBox(wideKinds.includes(kind) ? "0 0 120 64" : "0 0 64 64"),
      h.AriaHidden(true),
      h.Class(artLook)
    ],
    drawings[kind](h)
  )
