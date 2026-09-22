import type { StorybookConfig } from "storybook-solidjs-vite";

const config: StorybookConfig = {
  framework: "storybook-solidjs-vite",
  stories: ["../stories/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  core: { disableTelemetry: true },
};
export default config;
