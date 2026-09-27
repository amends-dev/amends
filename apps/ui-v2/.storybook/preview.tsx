import type { Decorator, DefinePreviewInput } from "storybook-solidjs-vite";
import { Show } from "solid-js";
import { Theme } from "../src/foundations/theme/index.ts";
import "../src/foundations/typography/fonts.ts";
import * as s from "./preview.css.ts";

type Mode = "light" | "dark" | "both";

/** Wraps every story in the toolbar's mode, or shows light and dark side by side. */
const withTheme: Decorator = (Story, context) => {
  const mode = (): Mode => context.globals["mode"] ?? "light";
  const layout = context.parameters["layout"] === "fullscreen" ? s.fullscreen : s.frame;
  return (
    <Show
      when={mode() === "both"}
      fallback={
        <Theme mode={mode() === "dark" ? "dark" : "light"} class={layout}>
          <Story />
        </Theme>
      }
    >
      <div class={s.pair}>
        <Theme mode="light" class={layout}>
          <Story />
        </Theme>
        <Theme mode="dark" class={layout}>
          <Story />
        </Theme>
      </div>
    </Show>
  );
};

const preview = {
  decorators: [withTheme],
  globalTypes: {
    mode: {
      description: "Color mode",
      toolbar: {
        title: "Mode",
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
          { value: "both", title: "Side by side" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { mode: "light" },
  parameters: {
    // The decorator supplies the canvas and padding.
    layout: "none",
    controls: { expanded: true },
    a11y: { test: "error" },
    options: {
      storySort: { order: ["Foundations", "Components", "Patterns", "Screens"] },
    },
  },
} satisfies DefinePreviewInput;
export default preview;
