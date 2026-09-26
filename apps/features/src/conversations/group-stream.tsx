import {
  toDate,
  useGroups,
  useGroupStream,
  useMarkGroupRead,
  useMembers,
  useTyping,
  type Thread,
} from "@amends/client";
import { Composer } from "@amends/ui/compositions/composer";
import { EmptyState } from "@amends/ui/compositions/empty-state";
import { Message } from "@amends/ui/compositions/message";
import { Transcript } from "@amends/ui/compositions/transcript";
import { Button } from "@amends/ui/primitives/button";
import { Drawing } from "@amends/ui/primitives/drawing";
import { Text } from "@amends/ui/primitives/text";
import { Match, Show, Switch } from "solid-js";
import { lostAccess } from "../internal/lost.ts";
import { NewThreadComposer } from "./composers.tsx";
import { Entries, type Post } from "./entries.tsx";
import { memberName, timeOf, typingText } from "./presentation.ts";

export interface GroupStreamProps {
  readonly workspaceId: string;
  readonly groupId: string;
  /** Names the stream for assistive technology, such as the group's name. */
  readonly label: string;
  /** Where each thread's link leads. */
  readonly threadHref: (threadId: string) => string;
  /** The thread that is open beside the stream. */
  readonly currentThread?: string;
}
interface Opening extends Post {
  readonly opening: Thread.Opening;
}
const replies = (count: number) => `${count} ${count === 1 ? "reply" : "replies"}`;
/**
 * A group's conversation as its threads' opening messages, oldest shown first and live while
 * mounted, each linking to its thread with its reply count, and a composer under it that starts
 * a thread. Earlier threads load on request.
 */
export function GroupStream(props: GroupStreamProps) {
  const stream = useGroupStream(props.workspaceId, props.groupId);
  // Losing access, as by being removed from the group, replaces what was shown.
  const lost = lostAccess(stream);
  const problem = () => lost() ?? (stream.value() === undefined ? stream.failure() : undefined);
  const members = useMembers(props.workspaceId);
  const groups = useGroups(props.workspaceId);
  const typing = useTyping(props.workspaceId);
  // Seeing the stream catches the reader up with the group, whenever it has something new.
  useMarkGroupRead(props.workspaceId, props.groupId, () => {
    const item = groups.value()?.find((entry) => entry.group.id === props.groupId);
    return item?.newActivity && item.latestActivityAt
      ? toDate(item.latestActivityAt).getTime()
      : undefined;
  });
  const posts = () =>
    (stream.value() ?? []).map((opening): Opening => ({
      key: opening.thread.id,
      author: opening.message.author,
      publishedAt: opening.message.publishedAt,
      text: opening.message.text,
      mentions: opening.message.mentions,
      opening,
    }));
  // Writing on the page starts a thread; it docks under the stream while the group is readable.
  const compose = () => (
    <Composer.Dock>
      <NewThreadComposer workspaceId={props.workspaceId} groupId={props.groupId} />
    </Composer.Dock>
  );
  return (
    <Switch>
      <Match when={problem()}>
        {(failure) => (
          <EmptyState.Root>
            <Drawing.Snapped />
            <EmptyState.Text>
              <EmptyState.Title>
                {failure() === "gone" || failure() === "denied"
                  ? "This group isn’t available"
                  : "Can’t load this conversation"}
              </EmptyState.Title>
              <EmptyState.Description>
                {failure() === "gone" || failure() === "denied"
                  ? "You may no longer be a member of it."
                  : "Try again once the host is reachable."}
              </EmptyState.Description>
            </EmptyState.Text>
            <Show when={failure() !== "gone" && failure() !== "denied"}>
              <EmptyState.Actions>
                <Button onClick={stream.retry}>Try again</Button>
              </EmptyState.Actions>
            </Show>
          </EmptyState.Root>
        )}
      </Match>
      <Match when={stream.value() === undefined}>
        <Text role="status" tone="secondary">
          Loading the conversation…
        </Text>
      </Match>
      <Match when={posts().length === 0}>
        <EmptyState.Root>
          <Drawing.Bare />
          <EmptyState.Text>
            <EmptyState.Title>Nothing said yet</EmptyState.Title>
            <EmptyState.Description>
              Write the first message below to start a thread.
            </EmptyState.Description>
          </EmptyState.Text>
        </EmptyState.Root>
        {compose()}
      </Match>
      <Match when={true}>
        <Transcript.Root aria-label={props.label}>
          <Show when={!stream.complete()}>
            <Transcript.Earlier>
              <Button
                variant="ghost"
                pending={stream.loadingEarlier()}
                onClick={stream.loadEarlier}
              >
                Show earlier threads
              </Button>
            </Transcript.Earlier>
          </Show>
          <Transcript.Items>
            <Entries
              posts={posts()}
              members={members}
              footer={(post) => {
                const opening = () => post().opening;
                const typists = () =>
                  typingText(
                    typing(opening().thread.id).map((memberId) =>
                      memberName(members.member(memberId)),
                    ),
                  );
                return (
                  <Message.Replies
                    href={props.threadHref(opening().thread.id)}
                    aria-current={props.currentThread === opening().thread.id ? "page" : undefined}
                  >
                    <Show when={opening().unread}>
                      <Message.Unread label="unread" />
                    </Show>
                    <Show when={opening().replies > 0}>
                      <Message.ReplyCount>{replies(opening().replies)}</Message.ReplyCount>
                    </Show>
                    <Message.ReplyNote>
                      {typists() ||
                        (opening().replies > 0
                          ? `last at ${timeOf(opening().latest.occurredAt).text}`
                          : "reply in thread")}
                    </Message.ReplyNote>
                  </Message.Replies>
                );
              }}
            />
          </Transcript.Items>
        </Transcript.Root>
        {compose()}
      </Match>
    </Switch>
  );
}
