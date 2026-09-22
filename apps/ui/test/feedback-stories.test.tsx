import { afterEach, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import dialogMeta, {
  Interaction as DialogInteraction,
  FormRecovery,
} from "../src/compositions/dialog/dialog.stories.tsx";
import toastMeta, {
  Interaction as ToastInteraction,
  Queue,
} from "../src/compositions/toast/toast.stories.tsx";
import popoverMeta, {
  Controlled as PopoverControlled,
  DefaultOpen as PopoverDefaultOpen,
  IconTrigger as PopoverIconTrigger,
  Interaction as PopoverInteraction,
  NestedDialog,
  NestedDrawer,
} from "../src/compositions/popover/popover.stories.tsx";
const dialog = definePreview(preview).meta(dialogMeta),
  toast = definePreview(preview).meta(toastMeta),
  popover = definePreview(preview).meta(popoverMeta);
afterEach(cleanup);
it("runs the Dialog interaction story", async () => {
  await dialog.story(DialogInteraction).run();
});
it("runs Dialog pending/error recovery", async () => {
  await dialog.story(FormRecovery).run();
});
it("runs Toast action and focus recovery", async () => {
  await toast.story(ToastInteraction).run();
});
it("runs Toast queue promotion and clearing", async () => {
  await toast.story(Queue).run();
});
it("runs Popover content actions and guarded close", async () => {
  await popover.story(PopoverInteraction).run();
});
it("opens Popover from one icon button", async () => {
  await popover.story(PopoverIconTrigger).run();
});
it("renders a default-open Popover", async () => {
  await popover.story(PopoverDefaultOpen).run();
});
it("keeps a Popover inside its native dialog host", async () => {
  await popover.story(NestedDialog).run();
});
it("updates a controlled Popover and closes it from content", async () => {
  await popover.story(PopoverControlled).run();
});
it("keeps a Popover inside its native drawer host", async () => {
  await popover.story(NestedDrawer).run();
});
