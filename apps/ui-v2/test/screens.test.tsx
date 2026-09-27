import { afterEach, describe, it, vi } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.tsx";
import conversationMeta, {
  Composing,
  Messages,
  TaskStates,
} from "../src/components/conversation.stories.tsx";
import groupMeta, {
  Reply,
  Send,
  ThreadOpen,
  Threads,
} from "../src/screens/group/group.stories.tsx";
import { viewport } from "./viewport.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("conversation components", () => {
  const stories = definePreview(preview).meta(conversationMeta);
  it("renders messages and task states", async () => {
    await stories.story(Messages).run();
    await stories.story(TaskStates).run();
  });
  it("sends with Enter, keeps Shift+Enter lines, and refuses blank drafts", async () => {
    await stories.story(Composing).run();
  });
});

describe("group threads screen", () => {
  const stories = definePreview(preview).meta(groupMeta);
  it("renders with and without the open thread", async () => {
    viewport(1600);
    await stories.story(Threads).run();
    await stories.story(ThreadOpen).run();
  });
  it("opens a thread from its replies, replies, and closes it", async () => {
    viewport(1600);
    await stories.story(Reply).run();
  });
  it("sends to the group and toggles a reaction", async () => {
    viewport(1600);
    await stories.story(Send).run();
  });
});
