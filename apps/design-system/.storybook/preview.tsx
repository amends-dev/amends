import "@amends/ui/fonts";
import "@amends/ui/styles";
import { vars } from "@amends/ui/vars";
import { createEffect } from "solid-js";
import { createJSXDecorator, type Preview } from "storybook-solidjs-vite";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Amends theme",
      toolbar: {
        icon: "circlehollow",
        items: [
          { value: "cotton", title: "Cotton" },
          { value: "soot", title: "Soot" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "cotton" },
  decorators: [
    createJSXDecorator((Story, context) => {
      createEffect(() => {
        document.documentElement.dataset.theme =
          context.globals.theme === "soot" ? "soot" : "cotton";
      });
      return (
        <div style={{ padding: vars.space[6], "max-width": "640px", "box-sizing": "border-box" }}>
          <Story />
        </div>
      );
    }),
  ],
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
    a11y: { test: "error" },
    options: { storySort: { order: ["Foundations", "Invitations"] } },
  },
};
export default preview;
