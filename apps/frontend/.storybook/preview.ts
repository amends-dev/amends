import type { DefinePreviewInput } from "storybook-solidjs-vite";

const preview = {
  parameters: {
    layout: "padded",
    controls: { expanded: true },
    a11y: { test: "error" },
    options: {
      storySort: {
        order: ["Setup", "Foundations", "Primitives", "Compositions", "Features", "Pages"],
      },
    },
  },
} satisfies DefinePreviewInput;
export default preview;
