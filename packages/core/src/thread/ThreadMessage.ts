/**
 * A message in a thread: markdown written by a member or a contact, and whom it addresses. Its
 * place in the thread is activity, `ThreadMessageActivity.Published`, recorded with it; the
 * message row holds the text once. `ThreadMessageService` publishes replies, and `ThreadService`
 * the message that opens a thread.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import { ThreadId } from "./ThreadId.ts";
import { ThreadMessageId } from "./ThreadMessageId.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";
import { Identity } from "../identity/identity.ts";
import { Text as Characters } from "../text/text.ts";
import { TurnId } from "../turn/id.ts";

/**
 * Names a message; `ThreadMessageId.Id`, where models that only refer to messages import it from.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = ThreadMessageId.Id;

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = ThreadMessageId.Id;

/**
 * Markdown, preserved as submitted, including indentation; whitespace-only text and characters
 * storage cannot keep as given are rejected. A mention in it is a link to the member, written by
 * `mentionText`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Text = Schema.NonEmptyString.check(
  Schema.makeFilter(
    (text) => /\S/u.test(text) || "Message text must contain non-whitespace content",
  ),
  Characters.isStorable,
);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Text = typeof Text.Type;

// Backslash-escaped so a name reads as itself, not as markdown, inside the link's label.
const labelMarks = /[\\[\]*_`~<>]/gu;

/**
 * A member mentioned in message text: `[@Ada](member:<id>)`. The label records the name they had
 * when mentioned, and readers show their current one. The text shows who was mentioned; a
 * message's `mentions` are whom it addresses.
 *
 * @category utils
 * @since 0.1.0
 */
export const mentionText = (memberId: string, name: string) =>
  `[@${name.replaceAll(labelMarks, "\\$&")}](member:${encodeURIComponent(memberId)})`;

const mentionLinks = /\[@(?:\\.|[^\\\]])*\]\(member:([^)\s]+)\)/gu;

/**
 * The members a text mentions, each once, in the order first mentioned.
 *
 * @category utils
 * @since 0.1.0
 */
export const mentionedIn = (text: string): ReadonlyArray<string> => [
  ...new Set(
    [...text.matchAll(mentionLinks)].flatMap(([, id]) => {
      try {
        return [decodeURIComponent(id!)];
      } catch {
        return [];
      }
    }),
  ),
];

/**
 * Who wrote a message: a member, human or agent, writing in a thread, or a contact whose message a
 * channel received. An agent's reply is its own message like anyone's; the turn that produced it
 * is how the agent worked, not who wrote it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Author = Schema.TaggedUnion({
  Member: { memberId: MemberId.Id },
  Contact: { contactId: Identity.ContactId },
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type Author = typeof Author.Type;

/**
 * A message as published. Its position in the thread is on its activity, not here.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  threadId: ThreadId.Id,
  author: Author,
  text: Text,
  mentions: Schema.UniqueArray(MemberId.Id),
  publishedAt: Schema.DateTimeUtcFromString,
  /** For an agent's reply, the turn that posted it, whose log tells how it came about. */
  turnId: Schema.NullOr(TurnId.Id),
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Record extends Schema.Schema.Type<typeof Record> {}

/**
 * What a reply says and whom it addresses. Without mentions it addresses every current
 * participant.
 *
 * @category options
 * @since 0.1.0
 */
export const PublishInput = Schema.Struct({
  threadId: ThreadId.Id,
  text: Text,
  mentions: Schema.UniqueArray(MemberId.Id),
});

/**
 * @category options
 * @since 0.1.0
 */
export interface PublishInput extends Schema.Schema.Type<typeof PublishInput> {}

export * as ThreadMessage from "./ThreadMessage.ts";
