import { For } from "solid-js"
import type { Meta, StoryObj } from "storybook-solidjs-vite"
import * as s from "../foundations.stories.css.ts"
import { space, type Space } from "./tokens.ts"

// Object keys list integers before fractions; show the scale in order.
const steps = (Object.keys(space).map(Number) as Array<Space>).sort((a, b) => a - b)

const meta = { title: "Foundations/Space" } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

export const Scale = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Spacing</h2>
        <p class={s.note}>A 4px grid with half steps for compact rows. Corners are square everywhere in the app.</p>
        <div class={s.panel}>
          <For each={steps}>
            {(step) => (
              <div class={s.specimenRow}>
                <span>
                  <span class={s.name}>space[{step}]</span>
                  <span class={s.value}>{step * 4}px</span>
                </span>
                <span class={s.barTrack}>
                  <span class={s.bar} style={{ width: space[step] }} data-space={step} />
                </span>
              </div>
            )}
          </For>
        </div>
      </section>
    </div>
  )
} satisfies Story
