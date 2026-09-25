import type { StorybookConfig } from "storybook-solidjs-vite";

const config: StorybookConfig = {
  framework: "storybook-solidjs-vite",
  stories: ["../workshop/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  core: { disableTelemetry: true },
  viteFinal(config) {
    config.server = {
      ...config.server,
      hmr: { port: 6009 },
      proxy: process.env.AMENDS_WORKSHOP_URL
        ? { "/__workshop": { target: process.env.AMENDS_WORKSHOP_URL } }
        : undefined,
    };
    return config;
  },
};
export default config;
