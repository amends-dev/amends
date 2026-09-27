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
import tasksMeta, {
  AllTasks,
  FilterAndOpen,
  TaskOpen,
} from "../src/screens/group/tasks.stories.tsx";
import settingsMeta, {
  AddMembers,
  General,
  Members,
  Rename,
} from "../src/screens/group/settings.stories.tsx";
import formsMeta, { Buttons, Fields } from "../src/components/forms.stories.tsx";
import createMeta, { CreateAndOpen, OpenForm } from "../src/screens/group/create.stories.tsx";
import directoryMeta, {
  Discover,
  JoinFromDiscover,
  PreviewAndJoin,
  PreviewPublicGroup,
  ReadPublicThread,
  YourGroups,
} from "../src/screens/groups/directory.stories.tsx";
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

describe("group tasks screen", () => {
  const stories = definePreview(preview).meta(tasksMeta);
  it("renders the list and an open task", async () => {
    viewport(1600);
    await stories.story(AllTasks).run();
    await stories.story(TaskOpen).run();
  });
  it("searches, filters by status, and opens a task", async () => {
    viewport(1600);
    await stories.story(FilterAndOpen).run();
  });
});

describe("group settings modal", () => {
  const stories = definePreview(preview).meta(settingsMeta);
  it("renders the general and members tabs", async () => {
    viewport(1600);
    await stories.story(General).run();
    await stories.story(Members).run();
  });
  it("saves a new name and visibility only when changed and named", async () => {
    viewport(1600);
    await stories.story(Rename).run();
  });
  it("chooses members by keyboard and pointer and adds them", async () => {
    viewport(1600);
    await stories.story(AddMembers).run();
  });
});

describe("form components", () => {
  const stories = definePreview(preview).meta(formsMeta);
  it("renders buttons", async () => {
    await stories.story(Buttons).run();
  });
  it("associates help and errors, switches choices, and picks members", async () => {
    await stories.story(Fields).run();
  });
});

describe("create group", () => {
  const stories = definePreview(preview).meta(createMeta);
  it("renders the form", async () => {
    viewport(1600);
    await stories.story(OpenForm).run();
  });
  it("creates a public group with members and opens its welcome", async () => {
    viewport(1600);
    await stories.story(CreateAndOpen).run();
  });
});

describe("browse groups", () => {
  const stories = definePreview(preview).meta(directoryMeta);
  it("renders the directory tabs and a preview", async () => {
    viewport(1600);
    await stories.story(YourGroups).run();
    await stories.story(Discover).run();
    await stories.story(PreviewPublicGroup).run();
    await stories.story(ReadPublicThread).run();
  });
  it("previews a public group, reads a thread, and joins", async () => {
    viewport(1600);
    await stories.story(PreviewAndJoin).run();
  });
  it("joins from Discover and opens the group from the toast", async () => {
    viewport(1600);
    await stories.story(JoinFromDiscover).run();
  });
});
