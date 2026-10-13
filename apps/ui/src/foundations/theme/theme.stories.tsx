import { For, createSignal } from "solid-js"
import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { expect, userEvent, within } from "storybook/test"
import { Button } from "../../components/button/index.ts"
import { Choice } from "../../components/choice/index.ts"
import { GroupWorkspace } from "../../screens/group/group.fixture.tsx"
import { Theme, paletteOptions, type ColorPalette } from "./index.ts"
import * as s from "./theme.stories.css.ts"

const meta = {
  title: "Foundations/Theme",
  parameters: { layout: "fullscreen" as const }
} satisfies Meta
export default meta

/** The same populated workspace in each palette; switching preserves the conversation draft. */
export const TryPalettes = {
  render: () => {
    const [palette, setPalette] = createSignal<ColorPalette>("linen")
    const [mode, setMode] = createSignal<"light" | "dark">("light")
    return (
      <Theme palette={palette()} mode={mode()} class={s.preview}>
        <div class={s.toolbar}>
          <Choice.Group label="Color palette" value={palette()} onChange={(value) => setPalette(value as ColorPalette)}>
            <For each={paletteOptions}>
              {(option) => <Choice.Option value={option.value}>{option.label}</Choice.Option>}
            </For>
          </Choice.Group>
          <Button variant="secondary" onClick={() => setMode(mode() === "light" ? "dark" : "light")}>
            {mode() === "light" ? "Try dark mode" : "Try light mode"}
          </Button>
        </div>
        <div class={s.workspace}>
          <GroupWorkspace />
        </div>
      </Theme>
    )
  }
} satisfies StoryObj

export const SwitchWithDraft = {
  ...TryPalettes,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const draft = canvas.getByRole("combobox", { name: "Message #general" })
    await userEvent.type(draft, "Keep this draft while comparing colors.")
    await userEvent.click(canvas.getByRole("radio", { name: "Sage" }))
    await userEvent.click(canvas.getByRole("button", { name: "Try dark mode" }))
    await expect(draft).toHaveTextContent("Keep this draft while comparing colors.")
    await expect(canvas.getByRole("radio", { name: "Sage" })).toBeChecked()
    await expect(draft.closest("[data-palette]")).toHaveAttribute("data-palette", "sage")
    await expect(draft.closest("[data-mode]")).toHaveAttribute("data-mode", "dark")
  }
} satisfies StoryObj
