import { Schema } from "effect";
import { ThreadId } from "../id.ts";
import { ThreadMessageId } from "./id.ts";
import { WorkspaceId } from "../../workspace/id.ts";
import { MemberId } from "../../workspace/member/id.ts";
import { Identity } from "../../identity/identity.ts";
import { Text as Characters } from "../../text/text.ts";
import { TurnId } from "../../turn/id.ts";
export const Id = ThreadMessageId.Id;

export type Id = ThreadMessageId.Id;

/**
 * Markdown, preserved as submitted, including indentation; reject whitespace-only messages. A
 * mention in it is a link to the member, written by `mentionText`.
 */
export const Text = Schema.NonEmptyString.check(
  Schema.makeFilter(
    (text) => /\S/u.test(text) || "Message text must contain non-whitespace content",
  ),
  Characters.isStorable,
);
export type Text = typeof Text.Type;

// Backslash-escaped so a name reads as itself, not as markdown, inside the link's label.
const labelMarks = /[\\[\]*_`~<>]/gu;

/**
 * A member mentioned in message text: `[@Ada](member:<id>)`. The label records the name they had
 * when mentioned, and readers show their current one. The text shows who was mentioned; a
 * message's `mentions` are whom it addresses.
 */
export const mentionText = (memberId: string, name: string) =>
  `[@${name.replaceAll(labelMarks, "\\$&")}](member:${encodeURIComponent(memberId)})`;

const mentionLinks = /\[@(?:\\.|[^\\\]])*\]\(member:([^)\s]+)\)/gu;

/** The members a text mentions, each once, in the order first mentioned. */
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
 */
export const Author = Schema.TaggedUnion({
  Member: { memberId: MemberId.Id },
  Contact: { contactId: Identity.ContactId },
});

export type Author = typeof Author.Type;

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

export interface Record extends Schema.Schema.Type<typeof Record> {}

export const PublishInput = Schema.Struct({
  threadId: ThreadId.Id,
  text: Text,
  mentions: Schema.UniqueArray(MemberId.Id),
});

export interface PublishInput extends Schema.Schema.Type<typeof PublishInput> {}

export * as ThreadMessage from "./message.ts";
