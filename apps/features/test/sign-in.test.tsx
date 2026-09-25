import { afterEach, inject, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, {
  Success,
  WrongCode,
  ExpiredCode,
  UsedCode,
  Resend,
  FailureRecovery,
  PendingAndChangeEmail,
  UnmountPending,
} from "../workshop/sign-in.stories.tsx";
import { closeScenarios } from "../workshop/scenario.ts";

declare module "vitest" {
  interface ProvidedContext {
    workshopUrl: string;
  }
}

afterEach(async () => {
  cleanup();
  await closeScenarios();
});
const stories = definePreview(preview).meta({ ...meta, args: { baseUrl: inject("workshopUrl") } });
for (const [name, story] of Object.entries({
  Success,
  WrongCode,
  ExpiredCode,
  UsedCode,
  Resend,
  FailureRecovery,
  PendingAndChangeEmail,
  UnmountPending,
})) {
  it(`runs ${name} through the real HTTP host and PostgreSQL`, async () => {
    await stories.story(story).run();
  });
}
