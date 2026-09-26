import { afterEach, inject, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, {
  Following,
  Group,
  InboxView,
  Reading,
  Typing,
  Writing,
} from "../workshop/conversations.stories.tsx";
import { closeScenarios } from "../workshop/scenario.ts";

afterEach(async () => {
  cleanup();
  window.location.hash = "";
  await closeScenarios();
});
const stories = definePreview(preview).meta({ ...meta, args: { baseUrl: inject("workshopUrl") } });
it("reads a group's stream and a thread, live, through HTTP and PostgreSQL", async () => {
  await stories.story(Group).run();
});
it("starts threads and replies from the composers, keeping drafts per thread", async () => {
  await stories.story(Writing).run();
});
it("reads a thread when it opens and catches up with the group while it shows", async () => {
  await stories.story(Reading).run();
});
it("shows another member typing until their message arrives", async () => {
  await stories.story(Typing).run();
});
it("follows a group and a thread, and a followed group's new threads reach the reader", async () => {
  await stories.story(Following).run();
});
it("lists the inbox newest first, settles what is seen or read, and takes new mentions live", async () => {
  await stories.story(InboxView).run();
});
