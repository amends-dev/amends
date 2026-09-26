import type { Members } from "@amends/client";
import { Avatar } from "@amends/ui/primitives/avatar";
import { Message } from "@amends/ui/compositions/message";
import { Transcript } from "@amends/ui/compositions/transcript";
import { For, Show, untrack, type Accessor, type JSX } from "solid-js";
import { keyed } from "../internal/keyed.ts";
import { authorOf, dayLabel, dayOf, initials, memberName, timeOf } from "./presentation.ts";

/** What a transcript shows for one message. */
export interface Post {
  readonly key: string;
  readonly author: Parameters<typeof authorOf>[0];
  readonly publishedAt: Parameters<typeof timeOf>[0];
  readonly text: string;
  /** The members the message addresses, whose `@name` in its text shows as a mention. */
  readonly mentions: ReadonlyArray<string>;
}
/** A quiet line between messages about the conversation, such as someone following it. */
export interface Note {
  readonly key: string;
  readonly note: string;
  readonly occurredAt: Parameters<typeof timeOf>[0];
}
const isNote = (entry: Post | Note): entry is Note => "note" in entry;
type Row<P extends Post> =
  | { readonly key: string; readonly kind: "day"; readonly day: number }
  | { readonly key: string; readonly kind: "post"; readonly post: P }
  | { readonly key: string; readonly kind: "note"; readonly note: Note };
const escaped = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
/** A message's text as plain runs and the `@name` of each member it mentions. */
const segments = (text: string, mentions: ReadonlyArray<string>, members: Members) => {
  const tokens = mentions
    .map((id) => `@${memberName(members.member(id))}`)
    .toSorted((left, right) => right.length - left.length);
  if (tokens.length === 0) return [{ text, mention: false }];
  return text
    .split(new RegExp(`(${tokens.map(escaped).join("|")})`, "u"))
    .filter(Boolean)
    .map((part) => ({ text: part, mention: tokens.includes(part) }));
};
/** Messages and notes oldest first, with a day seam before each new day. */
const rowsOf = <P extends Post>(posts: ReadonlyArray<P | Note>) => {
  const rows: Array<Row<P>> = [];
  let last: number | undefined;
  for (const entry of posts) {
    const day = dayOf(isNote(entry) ? entry.occurredAt : entry.publishedAt);
    if (day !== last) rows.push({ key: `day:${day}`, kind: "day", day });
    last = day;
    rows.push(
      isNote(entry)
        ? { key: entry.key, kind: "note", note: entry }
        : { key: entry.key, kind: "post", post: entry as P },
    );
  }
  return rows;
};
/**
 * Day seams, messages, and notes for a Transcript, keyed so that refreshes keep each entry
 * mounted and the transcript can keep the reader's place. `footer` adds content under a
 * message's text.
 */
export function Entries<P extends Post>(props: {
  readonly posts: ReadonlyArray<P | Note>;
  readonly members: Members;
  readonly density?: "comfortable" | "compact";
  /** Rendered once per entry; it reads the current post, so refreshes update it in place. */
  readonly footer?: (post: Accessor<P>) => JSX.Element;
  /** The key of the post the reader came to see: set apart and brought into view. */
  readonly focus?: string;
}) {
  const rows = keyed(
    () => rowsOf(props.posts),
    (row) => row.key,
  );
  return (
    <For each={rows.ids()}>
      {(key) => {
        const row = () => rows.get(key)!;
        const note = () => (row() as Extract<Row<P>, { kind: "note" }>).note;
        return (
          <Show
            when={row().kind === "post" ? (row() as Extract<Row<P>, { kind: "post" }>) : undefined}
            fallback={
              row().kind === "note" ? (
                <Transcript.Note>
                  {note().note}
                  <Transcript.NoteTime
                    datetime={timeOf(note().occurredAt).datetime}
                    title={timeOf(note().occurredAt).title}
                  >
                    {timeOf(note().occurredAt).text}
                  </Transcript.NoteTime>
                </Transcript.Note>
              ) : (
                <Transcript.Day>
                  {dayLabel((row() as Extract<Row<P>, { kind: "day" }>).day)}
                </Transcript.Day>
              )
            }
          >
            {(entry) => {
              const post = () => entry().post;
              const author = () => authorOf(post().author, props.members.member);
              const time = () => timeOf(post().publishedAt);
              const id = `message-${key}`;
              return (
                <Transcript.Entry focused={props.focus === key}>
                  <Message.Root aria-labelledby={id} density={props.density}>
                    <Message.Avatar>
                      <Avatar.Root kind={author().kind} decorative>
                        <Avatar.Fallback>{initials(author().name)}</Avatar.Fallback>
                      </Avatar.Root>
                    </Message.Avatar>
                    <Message.Content>
                      <Message.Header>
                        <Message.Author id={id}>{author().name}</Message.Author>
                        <Message.Time datetime={time().datetime} title={time().title}>
                          {time().text}
                        </Message.Time>
                      </Message.Header>
                      <Message.Body>
                        <For each={segments(post().text, post().mentions, props.members)}>
                          {(part) =>
                            part.mention ? (
                              <Message.Mention>{part.text}</Message.Mention>
                            ) : (
                              part.text
                            )
                          }
                        </For>
                      </Message.Body>
                      {untrack(() => props.footer?.(post))}
                    </Message.Content>
                  </Message.Root>
                </Transcript.Entry>
              );
            }}
          </Show>
        );
      }}
    </For>
  );
}
