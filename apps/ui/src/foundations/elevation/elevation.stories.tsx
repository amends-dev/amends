import type { Meta, StoryObj } from "storybook-solidjs-vite";
import * as s from "../foundations.stories.css.ts";

const meta = { title: "Foundations/Elevation" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Layers = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Elevation</h2>
        <p class={s.note}>
          Panels are flat. Only layers that float above the page cast a shadow: modals, popovers,
          and toasts.
        </p>
        <div class={s.elevationGrid}>
          <div class={`${s.card} ${s.shadows.modal}`}>Modal</div>
          <div class={`${s.card} ${s.shadows.popover}`}>Popover</div>
          <div class={`${s.card} ${s.shadows.toast}`}>Toast</div>
        </div>
      </section>
    </div>
  ),
} satisfies Story;
