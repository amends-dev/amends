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
type Row<P extends Post> =
  | { readonly key: string; readonly kind: "day"; readonly day: number }
  | { readonly key: string; readonly kind: "post"; readonly post: P };
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
/** Messages oldest first, with a day seam before each new day. */
const rowsOf = <P extends Post>(posts: ReadonlyArray<P>) => {
  const rows: Array<Row<P>> = [];
  let last: number | undefined;
  for (const post of posts) {
    const day = dayOf(post.publishedAt);
    if (day !== last) rows.push({ key: `day:${day}`, kind: "day", day });
    last = day;
    rows.push({ key: post.key, kind: "post", post });
  }
  return rows;
};
/**
 * Day seams and messages for a Transcript, keyed so that refreshes keep each entry mounted and
 * the transcript can keep the reader's place. `footer` adds content under a message's text.
 */
export function Entries<P extends Post>(props: {
  readonly posts: ReadonlyArray<P>;
  readonly members: Members;
  readonly density?: "comfortable" | "compact";
  /** Rendered once per entry; it reads the current post, so refreshes update it in place. */
  readonly footer?: (post: Accessor<P>) => JSX.Element;
}) {
  const rows = keyed(
    () => rowsOf(props.posts),
    (row) => row.key,
  );
  return (
    <For each={rows.ids()}>
      {(key) => {
        const row = () => rows.get(key)!;
        return (
          <Show
            when={row().kind === "post" ? (row() as Extract<Row<P>, { kind: "post" }>) : undefined}
            fallback={
              <Transcript.Day>
                {dayLabel((row() as Extract<Row<P>, { kind: "day" }>).day)}
              </Transcript.Day>
            }
          >
            {(entry) => {
              const post = () => entry().post;
              const author = () => authorOf(post().author, props.members.member);
              const time = () => timeOf(post().publishedAt);
              const id = `message-${key}`;
              return (
                <Transcript.Entry>
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
