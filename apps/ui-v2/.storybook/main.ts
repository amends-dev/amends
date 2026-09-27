import type { StorybookConfig } from "storybook-solidjs-vite";

const config: StorybookConfig = {
  framework: "storybook-solidjs-vite",
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  core: { disableTelemetry: true },
  viteFinal(config) {
    // Vite's default HMR port is shared; a fixed one lets this run beside the other workshops.
    config.server = { ...config.server, hmr: { port: 6011 } };
    return config;
  },
};
export default config;
