import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { buttonOf, formatGroups, formatOfKey } from "./toolbar.ts"

const noModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }

describe("the buttons and keys of the formats", () => {
  it("groups the formats as the toolbar does, each once", () => {
    expect(formatGroups).toEqual([
      ["Bold", "Italic", "Strikethrough"],
      ["Link"],
      ["NumberedList", "BulletedList"],
      ["Quote", "Code", "CodeBlock"]
    ])
  })

  it("draws a button with the icon, label, and keys of each format", () => {
    expect(formatGroups.flat().map((format) => buttonOf(format))).toEqual([
      { icon: "bold", label: "Bold", keys: "Control+B Meta+B" },
      { icon: "italic", label: "Italic", keys: "Control+I Meta+I" },
      { icon: "strikethrough", label: "Strikethrough", keys: "Control+Shift+X Meta+Shift+X" },
      { icon: "link", label: "Link", keys: "Control+Shift+U Meta+Shift+U" },
      { icon: "list-ordered", label: "Numbered list", keys: "Control+Shift+7 Meta+Shift+7" },
      { icon: "list", label: "Bulleted list", keys: "Control+Shift+8 Meta+Shift+8" },
      { icon: "quote", label: "Quote", keys: "Control+Shift+9 Meta+Shift+9" },
      { icon: "code", label: "Code", keys: "Control+Shift+C Meta+Shift+C" },
      { icon: "code-block", label: "Code block", keys: "Control+Alt+Shift+C Meta+Alt+Shift+C" }
    ])
  })

  it("asks for a format with Control or Command and its key, with Shift and Alt as the format has them", () => {
    const ctrl = { ...noModifiers, ctrlKey: true }
    const meta = { ...noModifiers, metaKey: true }
    const ctrlShift = { ...ctrl, shiftKey: true }

    expect(formatOfKey("b", ctrl)).toEqual(Option.some("Bold"))
    expect(formatOfKey("B", meta)).toEqual(Option.some("Bold"))
    expect(formatOfKey("i", ctrl)).toEqual(Option.some("Italic"))
    expect(formatOfKey("X", ctrlShift)).toEqual(Option.some("Strikethrough"))
    expect(formatOfKey("u", { ...meta, shiftKey: true })).toEqual(Option.some("Link"))
    expect(formatOfKey("7", ctrlShift)).toEqual(Option.some("NumberedList"))
    expect(formatOfKey("&", ctrlShift)).toEqual(Option.some("NumberedList"))
    expect(formatOfKey("*", ctrlShift)).toEqual(Option.some("BulletedList"))
    expect(formatOfKey("(", ctrlShift)).toEqual(Option.some("Quote"))
    expect(formatOfKey("c", ctrlShift)).toEqual(Option.some("Code"))
    expect(formatOfKey("c", { ...ctrlShift, altKey: true })).toEqual(Option.some("CodeBlock"))
    expect(formatOfKey("ç", { ...ctrlShift, altKey: true })).toEqual(Option.some("CodeBlock"))
  })

  it("leaves a key without Control or Command, or with the wrong Shift or Alt, to the browser", () => {
    const ctrl = { ...noModifiers, ctrlKey: true }

    expect(formatOfKey("b", noModifiers)).toEqual(Option.none())
    expect(formatOfKey("b", { ...noModifiers, shiftKey: true })).toEqual(Option.none())
    expect(formatOfKey("b", { ...ctrl, shiftKey: true })).toEqual(Option.none())
    expect(formatOfKey("x", ctrl)).toEqual(Option.none())
    expect(formatOfKey("c", ctrl)).toEqual(Option.none())
    expect(formatOfKey("z", ctrl)).toEqual(Option.none())
    expect(formatOfKey("Enter", ctrl)).toEqual(Option.none())
  })
})
