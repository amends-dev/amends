import { afterEach, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, { Rendering } from "../src/setup.stories.tsx";
import textMeta, { ReactiveProps } from "../src/primitives/text/text.stories.tsx";
import buttonMeta, {
  Activation,
  Forms,
  SecondaryActivation,
  SecondaryForms,
  GhostActivation,
  GhostForms,
  Pending,
  SecondaryPending,
  GhostPending,
  ReactiveProps as ButtonReactiveProps,
} from "../src/primitives/button/button.stories.tsx";

import inputMeta, { Editing, Forms as InputForms } from "../src/primitives/input/input.stories.tsx";
import fieldMeta, {
  ReactiveAssociations,
  Forms as FieldForms,
} from "../src/compositions/field/field.stories.tsx";
import radioMeta, {
  Interaction as RadioInteraction,
  Forms as RadioForms,
} from "../src/primitives/radio/radio.stories.tsx";
import radioGroupMeta, {
  Interaction as GroupInteraction,
  CardInteraction,
  Forms as GroupForms,
  CardForms,
  RefreshedOptions,
} from "../src/compositions/radio-group/radio-group.stories.tsx";
import checkboxMeta, {
  Interaction as checkboxInteraction,
  Forms as checkboxForms,
} from "../src/primitives/checkbox/checkbox.stories.tsx";
const checkboxStories = definePreview(preview).meta(checkboxMeta);
import switchMeta, {
  Interaction as switchInteraction,
  Forms as switchForms,
} from "../src/primitives/switch/switch.stories.tsx";
const switchStories = definePreview(preview).meta(switchMeta);
import selectMeta, {
  Interaction as selectInteraction,
  Forms as selectForms,
  ResetDefaults as selectResetDefaults,
  Keyboard as selectKeyboard,
} from "../src/primitives/select/select.stories.tsx";
const selectStories = definePreview(preview).meta(selectMeta);
const groupStories = definePreview(preview).meta(radioGroupMeta);
const radioStories = definePreview(preview).meta(radioMeta);
const fieldStories = definePreview(preview).meta(fieldMeta);
const inputStories = definePreview(preview).meta(inputMeta);

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

it("runs the secondary Button activation story", async () => {
  await buttonStories.story(SecondaryActivation).run();
});
it("runs the secondary Button form story", async () => {
  await buttonStories.story(SecondaryForms).run();
});

it("runs the ghost Button activation story", async () => {
  await buttonStories.story(GhostActivation).run();
});
it("runs the ghost Button form story", async () => {
  await buttonStories.story(GhostForms).run();
});

it("runs the primary Button pending and recovery story", async () => {
  await buttonStories.story(Pending).run();
});
it("runs the secondary Button pending and recovery story", async () => {
  await buttonStories.story(SecondaryPending).run();
});
it("runs the ghost Button pending and recovery story", async () => {
  await buttonStories.story(GhostPending).run();
});

it("runs the Input editing story", async () => {
  await inputStories.story(Editing).run();
});
it("runs the Input form story", async () => {
  await inputStories.story(InputForms).run();
});

it("runs the Field association story", async () => {
  await fieldStories.story(ReactiveAssociations).run();
});
it("runs the Field form story", async () => {
  await fieldStories.story(FieldForms).run();
});

it("runs the Radio interaction story", async () => {
  await radioStories.story(RadioInteraction).run();
});
it("runs the Radio form story", async () => {
  await radioStories.story(RadioForms).run();
});

for (const [name, story] of Object.entries({
  GroupInteraction,
  CardInteraction,
  GroupForms,
  CardForms,
  RefreshedOptions,
})) {
  it(`runs the RadioGroup ${name} story`, async () => {
    await groupStories.story(story).run();
  });
}

it("runs the checkbox interaction story", async () => {
  await checkboxStories.story(checkboxInteraction).run();
});
it("runs the checkbox form story", async () => {
  await checkboxStories.story(checkboxForms).run();
});

it("runs the switch interaction story", async () => {
  await switchStories.story(switchInteraction).run();
});
it("runs the switch form story", async () => {
  await switchStories.story(switchForms).run();
});

it("runs the select interaction story", async () => {
  await selectStories.story(selectInteraction).run();
});
it("runs the select form story", async () => {
  await selectStories.story(selectForms).run();
});
it("runs the select default reset story", async () => {
  await selectStories.story(selectResetDefaults).run();
});
it("runs the select keyboard story", async () => {
  await selectStories.story(selectKeyboard).run();
});
