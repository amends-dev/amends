import { afterEach, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, { Rendering } from "../src/setup.stories.tsx";
import textMeta, { ReactiveProps } from "../src/primitives/text/text.stories.tsx";
import buttonMeta, {
  Activation,
  Forms,
  ReactiveProps as ButtonReactiveProps,
} from "../src/primitives/button/button.stories.tsx";

const stories = definePreview(preview).meta(meta);
const textStories = definePreview(preview).meta(textMeta);
const buttonStories = definePreview(preview).meta(buttonMeta);
afterEach(cleanup);

it("runs the Solid rendering and interaction story", async () => {
  await stories.story(Rendering).run();
});

it("runs the Text reactive-props story", async () => {
  await textStories.story(ReactiveProps).run();
});

it("runs the Button activation story", async () => {
  await buttonStories.story(Activation).run();
});
it("runs the Button form story", async () => {
  await buttonStories.story(Forms).run();
});
it("runs the Button reactive-props story", async () => {
  await buttonStories.story(ButtonReactiveProps).run();
});
