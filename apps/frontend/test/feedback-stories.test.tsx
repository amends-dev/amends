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
const dialog = definePreview(preview).meta(dialogMeta),
  toast = definePreview(preview).meta(toastMeta);
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
