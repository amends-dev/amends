import type { DefinePreviewInput } from "storybook-solidjs-vite";
import "@amends/ui/foundations/typography/fonts";
import "@amends/ui/styles";

export default {
  parameters: { layout: "padded", controls: { disable: true }, a11y: { test: "error" } },
} satisfies DefinePreviewInput;
