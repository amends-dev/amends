import { useGroupStream, useMembers, type Thread } from "@amends/client";
import { Composer } from "@amends/ui/compositions/composer";
import { EmptyState } from "@amends/ui/compositions/empty-state";
import { Message } from "@amends/ui/compositions/message";
import { Transcript } from "@amends/ui/compositions/transcript";
import { Button } from "@amends/ui/primitives/button";
import { Drawing } from "@amends/ui/primitives/drawing";
import { Text } from "@amends/ui/primitives/text";
import { Match, Show, Switch } from "solid-js";
import { NewThreadComposer } from "./composers.tsx";
import { Entries, type Post } from "./entries.tsx";
import { timeOf } from "./presentation.ts";

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
  const members = useMembers(props.workspaceId);
  const posts = () =>
    (stream.value() ?? []).map((opening): Opening => ({
      key: opening.thread.id,
      author: opening.message.author,
      publishedAt: opening.message.publishedAt,
      text: opening.message.text,
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
      <Match when={stream.value() === undefined && stream.failure()}>
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
              footer={(post) => (
                <Message.Replies
                  href={props.threadHref(post.opening.thread.id)}
                  aria-current={props.currentThread === post.opening.thread.id ? "page" : undefined}
                >
                  <Show
                    when={post.opening.replies > 0}
                    fallback={<Message.ReplyNote>reply in thread</Message.ReplyNote>}
                  >
                    <Message.ReplyCount>{replies(post.opening.replies)}</Message.ReplyCount>
                    <Message.ReplyNote>
                      last at {timeOf(post.opening.latest.occurredAt).text}
                    </Message.ReplyNote>
                  </Show>
                </Message.Replies>
              )}
            />
          </Transcript.Items>
        </Transcript.Root>
        {compose()}
      </Match>
    </Switch>
  );
}
