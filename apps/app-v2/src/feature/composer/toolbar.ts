/** The composer's formatting toolbar: labels, icons, groups, and keyboard shortcuts. */

import type { IconName } from "@amends-dev/design/icon"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import type { KeyboardModifiers } from "foldkit/html"
import { Format } from "./definition.ts"

/** A key that asks for a format with Control or Command: the keys it may be, and whether Shift and Alt are held. */
type Shortcut = Readonly<{ name: string; keys: ReadonlyArray<string>; hasShift: boolean; hasAlt: boolean }>

/** What a format is called, how it is drawn, and the shortcut that asks for it, as `apps/ui` has them. */
type FormatLook = Readonly<{ icon: IconName; label: string; shortcut: Shortcut }>

/**
 * The keys of a shortcut are what the key is as the browser names it: with Shift held a digit is the symbol over it on
 * a US layout, and with Alt held a letter may be the one it makes on an Apple keyboard.
 */
const formatLooks: Readonly<Record<Format, FormatLook>> = {
  Bold: { icon: "bold", label: "Bold", shortcut: { name: "B", keys: ["b"], hasShift: false, hasAlt: false } },
  Italic: { icon: "italic", label: "Italic", shortcut: { name: "I", keys: ["i"], hasShift: false, hasAlt: false } },
  Strikethrough: {
    icon: "strikethrough",
    label: "Strikethrough",
    shortcut: { name: "Shift+X", keys: ["x"], hasShift: true, hasAlt: false }
  },
  Link: { icon: "link", label: "Link", shortcut: { name: "Shift+U", keys: ["u"], hasShift: true, hasAlt: false } },
  NumberedList: {
    icon: "list-ordered",
    label: "Numbered list",
    shortcut: { name: "Shift+7", keys: ["7", "&"], hasShift: true, hasAlt: false }
  },
  BulletedList: {
    icon: "list",
    label: "Bulleted list",
    shortcut: { name: "Shift+8", keys: ["8", "*"], hasShift: true, hasAlt: false }
  },
  Quote: {
    icon: "quote",
    label: "Quote",
    shortcut: { name: "Shift+9", keys: ["9", "("], hasShift: true, hasAlt: false }
  },
  Code: { icon: "code", label: "Code", shortcut: { name: "Shift+C", keys: ["c"], hasShift: true, hasAlt: false } },
  CodeBlock: {
    icon: "code-block",
    label: "Code block",
    shortcut: { name: "Alt+Shift+C", keys: ["c", "ç"], hasShift: true, hasAlt: true }
  }
}

/** The formats as the toolbar groups them, in order: emphasis, link, lists, and quote and code. */
export const formatGroups: ReadonlyArray<ReadonlyArray<Format>> = [
  ["Bold", "Italic", "Strikethrough"],
  ["Link"],
  ["NumberedList", "BulletedList"],
  ["Quote", "Code", "CodeBlock"]
]

/** What a format's button shows, says, and names the keys of: `Control+B Meta+B`. */
export const buttonOf = (format: Format): Readonly<{ icon: IconName; label: string; keys: string }> => {
  const { icon, label, shortcut } = formatLooks[format]

  return { icon, label, keys: `Control+${shortcut.name} Meta+${shortcut.name}` }
}

/**
 * The format a key pressed in the box asks for, when it is a shortcut: Control or Command with its letter or digit, and
 * Shift and Alt as the shortcut has them. Which of Control and Command is the platform's the view does not know, so
 * either asks.
 */
export const formatOfKey = (
  key: string,
  { ctrlKey, metaKey, shiftKey, altKey }: KeyboardModifiers
): Option.Option<Format> =>
  ctrlKey || metaKey
    ? Array.findFirst(Format.literals, (format) => {
        const { shortcut } = formatLooks[format]

        return shortcut.keys.includes(key.toLowerCase()) && shortcut.hasShift === shiftKey && shortcut.hasAlt === altKey
      })
    : Option.none()
