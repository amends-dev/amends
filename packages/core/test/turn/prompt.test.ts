import { describe, expect, it } from "@effect/vitest";
import { DateTime } from "effect";
import type { Prompt } from "effect/ai";
import { Identity } from "../../src/identity/identity.ts";
import { Group } from "../../src/group/group.ts";
import type { Task } from "../../src/task/Task.ts";
import { Thread } from "../../src/thread/Thread.ts";
import { ThreadActivity } from "../../src/thread/ThreadActivity.ts";
import { ThreadMessage } from "../../src/thread/ThreadMessage.ts";
import { ThreadParticipation } from "../../src/thread/ThreadParticipation.ts";
import { TurnPrompt } from "../../src/turn/prompt.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { Workspace } from "../../src/workspace/workspace.ts";

const workspaceId = Workspace.Id.make("workspace");
const threadId = Thread.Id.make("thread");
const at = DateTime.makeUnsafe("2026-10-10T12:00:00Z");
const reviewer = Member.Id.make("reviewer");
const adaId = Member.Id.make("ada");
const kaiId = Member.Id.make("kai");
const danaId = Identity.ContactId.make("dana");
const ada: ThreadMessage.Author = { _tag: "Member", memberId: adaId };
const dana: ThreadMessage.Author = { _tag: "Contact", contactId: danaId };
const memberNames: Record<string, string> = {
  [adaId]: "Ada",
  [kaiId]: "Kai",
  [reviewer]: "Reviewer",
};
const names: TurnPrompt.Names = {
  member: (memberId) => memberNames[memberId]!,
  contact: () => "Dana",
};
const options: TurnPrompt.Options = { self: reviewer, names, retriedBy: undefined };
const none: TurnPrompt.Context = { title: null, task: undefined };

let sequence = 0;
/** An activity of `kind` at the next position, with `details`. */
const activity = (kind: string, details: unknown) =>
  ({
    id: ThreadActivity.Id.make(`activity-${++sequence}`),
    workspaceId,
    threadId,
    sequence,
    kind,
    version: 1,
    subject: { kind: "test", id: "x" },
    occurrence: null,
    newActivity: false,
    recordedAt: at,
    details,
  }) as never;
const message = (
  id: string,
  author: ThreadMessage.Author,
  content: ThreadMessage.Content,
): ThreadMessage.Record => ({
  id: ThreadMessage.Id.make(id),
  workspaceId,
  threadId,
  author,
  via: null,
  publishedAt: at,
  content,
});
const text = (text: string): ThreadMessage.Content => ThreadMessage.published(text, []);
const published = (id: string, author: ThreadMessage.Author, body: string): Thread.TimelineItem =>
  ({
    activity: activity("message.published", { messageId: id }),
    message: message(id, author, text(body)),
  }) as never;
const edited = (id: string, author: ThreadMessage.Author, body: string): Thread.TimelineItem =>
  ({
    activity: activity("message.edited", { messageId: id }),
    message: message(id, author, text(body)),
  }) as never;
const deleted = (id: string, author: ThreadMessage.Author): Thread.TimelineItem =>
  ({
    activity: activity("message.deleted", { messageId: id }),
    message: message(id, author, { _tag: "Deleted", deletedAt: at }),
  }) as never;
const renamed = (title: string): Thread.TimelineItem =>
  ({ activity: activity("thread.renamed", { title, previous: null }) }) as never;
const followed = (participant: ThreadParticipation.Reference): Thread.TimelineItem =>
  ({
    activity: activity("participation.followed", { participationId: "p" }),
    participant: { id: ThreadParticipation.Id.make("p"), participant, status: "active" },
  }) as never;
const taskCreated = (details: {
  status: Task.Status;
  priority: Task.Priority;
  assignee: Member.Id | null;
  createdBy: ThreadMessage.Author;
}): Thread.TimelineItem => ({ activity: activity("task.created", details) }) as never;
const taskUpdated = (change: Task.Change): Thread.TimelineItem =>
  ({ activity: activity("task.updated", change) }) as never;
const turnCreated = (): Thread.TimelineItem =>
  ({
    activity: activity("turn.created", { turnId: "t", memberId: reviewer, retryOf: null }),
  }) as never;
const task = (fields: Partial<Task.Record> = {}): Task.Record => ({
  threadId,
  workspaceId,
  groupId: Group.GeneralId,
  status: "todo",
  priority: "none",
  assignee: reviewer,
  createdBy: ada,
  createdAt: at,
  ...fields,
});

/** The texts of a prompt's parts. */
const textsOf = (message: Prompt.Message | undefined) =>
  message === undefined || typeof message.content === "string"
    ? message
    : message.content.flatMap((part) => (part.type === "text" ? [part.text] : []));

describe("a turn's prompt", () => {
  it("tells each item in its kind's words, naming people and the agent as you", () => {
    const prompt = TurnPrompt.promptOf(
      none,
      [
        published("m1", ada, "Can you review this?"),
        published("m2", dana, "Please hurry."),
        renamed("Review of the launch"),
        followed({ _tag: "Member", memberId: kaiId }),
        followed({ _tag: "Triage" }),
        taskCreated({ status: "todo", priority: "high", assignee: reviewer, createdBy: ada }),
        taskUpdated({ _tag: "Status", from: "todo", to: "doing" }),
        taskUpdated({ _tag: "Assignee", from: reviewer, to: kaiId }),
        taskUpdated({ _tag: "Assignee", from: kaiId, to: null }),
        taskUpdated({ _tag: "Priority", from: "high", to: "none" }),
        turnCreated(),
      ],
      options,
    );
    expect(textsOf(prompt)).toEqual([
      "Ada: Can you review this?",
      "Dana: Please hurry.",
      "The thread was renamed to “Review of the launch”.",
      "Kai joined the thread.",
      "Triage joined the thread.",
      "Ada made this thread a task: status to do, priority high, assigned to you.",
      "The task's status is now doing.",
      "The task was assigned to Kai.",
      "The task was unassigned.",
      "The task's priority was cleared.",
    ]);
  });

  it("tells an edit by its new text unless the message is told in the same prompt, and a deletion as such", () => {
    expect(
      textsOf(
        TurnPrompt.promptOf(
          none,
          [
            published("m1", ada, "Review this, pleas."),
            edited("m1", ada, "Review this, please."),
            edited("m2", ada, "Mind the risks too."),
            deleted("m3", dana),
            published("m4", ada, "Gone"),
            deleted("m4", ada),
          ],
          options,
        ),
      ),
    ).toEqual([
      "Ada: Review this, pleas.",
      "Ada edited their message: Mind the risks too.",
      "Dana deleted their message.",
      "Ada: Gone",
      "Ada deleted their message.",
    ]);
    expect(TurnPrompt.countMessages([published("m1", ada, "x"), deleted("m2", ada)])).toBe(1);
  });

  it("starts with the thread as it stands when it has a title or is a task", () => {
    const items = [published("m1", ada, "Hello.")];
    expect(
      textsOf(
        TurnPrompt.promptOf(
          { title: Thread.Title.make("Launch"), task: undefined },
          items,
          options,
        ),
      ),
    ).toEqual(["The thread is titled “Launch”.", "Ada: Hello."]);
    expect(
      textsOf(
        TurnPrompt.promptOf(
          {
            title: Thread.Title.make("Launch"),
            task: task({ status: "doing", priority: "urgent" }),
          },
          items,
          options,
        ),
      ),
    ).toEqual([
      "The thread is titled “Launch”. It is a task: status doing, priority urgent, assigned to you.",
      "Ada: Hello.",
    ]);
    expect(
      textsOf(TurnPrompt.promptOf({ title: null, task: task({ assignee: null }) }, items, options)),
    ).toEqual(["This thread is a task: status to do, unassigned.", "Ada: Hello."]);
  });

  it("tells the agent who asked it to try again, and is nothing when there is nothing to say", () => {
    expect(
      textsOf(
        TurnPrompt.promptOf(none, [published("m1", ada, "Review this.")], {
          ...options,
          retriedBy: "Kai",
        }),
      ),
    ).toEqual(["Ada: Review this.", "Kai asked you to try that again."]);
    expect(textsOf(TurnPrompt.promptOf(none, [], { ...options, retriedBy: "Kai" }))).toEqual([
      "Kai asked you to try that again.",
    ]);
    expect(TurnPrompt.promptOf(none, [], options)).toBeUndefined();
    expect(TurnPrompt.promptOf(none, [turnCreated()], options)).toBeUndefined();
    // The context alone says nothing.
    expect(
      TurnPrompt.promptOf({ title: Thread.Title.make("Launch"), task: undefined }, [], options),
    ).toBeUndefined();
  });

  it("names everyone the items and the task mention, for the caller to look up", () => {
    expect(
      TurnPrompt.peopleOf({ title: null, task: task({ assignee: kaiId }) }, [
        published("m1", dana, "Hi"),
        followed({ _tag: "Member", memberId: adaId }),
        taskCreated({ status: "triage", priority: "none", assignee: null, createdBy: dana }),
        taskUpdated({ _tag: "Assignee", from: null, to: reviewer }),
      ]),
    ).toEqual([
      { _tag: "Member", memberId: kaiId },
      dana,
      ada,
      dana,
      { _tag: "Member", memberId: reviewer },
    ]);
  });
});

describe("the conversation an agent joins", () => {
  const input = (author: string, own: boolean, text: string): TurnPrompt.Input => ({
    author,
    own,
    text,
  });
  it("has others' messages as the user's and the agent's own as its answers, sides alternating", () => {
    const conversation = TurnPrompt.conversationOf([
      input("Ada", false, "Hello."),
      input("Kai", false, "Hi all."),
      input("Reviewer", true, "Hello, both."),
      input("Reviewer", true, "What do you need?"),
      input("Ada", false, "A review."),
    ]);
    expect(conversation.map((message) => [message.role, textsOf(message)])).toEqual([
      ["user", ["Ada: Hello.", "Kai: Hi all."]],
      ["assistant", ["Hello, both.", "What do you need?"]],
      ["user", ["Ada: A review."]],
    ]);
    expect(TurnPrompt.conversationOf([])).toEqual([]);
  });
});
