import { afterEach, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import meta, {
  Validation,
  Submitting,
  Succeeded,
  Failed,
  Retry,
  AvailabilityChanges,
} from "../stories/invitations/issue-invitation-form.stories.tsx";

// The adapter exposes portable stories through definePreview. These execute the
// same render and play functions without coupling the repo to addon-vitest's runner range.
const stories = definePreview({}).meta(meta);
afterEach(cleanup);
for (const [name, scenario] of Object.entries({
  Validation,
  Submitting,
  Succeeded,
  Failed,
  Retry,
  AvailabilityChanges,
})) {
  it(`Storybook interaction: ${name}`, async () => {
    await stories.story(scenario).run();
  });
}
