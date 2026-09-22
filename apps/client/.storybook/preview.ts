import type { DefinePreviewInput } from "storybook-solidjs-vite";

const preview = {
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
    a11y: { test: "error" },
  },
} satisfies DefinePreviewInput;
export default preview;
