import {
  useMarkThreadRead,
  useMembers,
  useThreadFollow,
  useThreadTimeline,
  useTyping,
  type ThreadTimeline,
} from "@amends/client";
import { Composer } from "@amends/ui/compositions/composer";
import { EmptyState } from "@amends/ui/compositions/empty-state";
import { Shell } from "@amends/ui/compositions/shell";
import { Transcript } from "@amends/ui/compositions/transcript";
import { Button } from "@amends/ui/primitives/button";
import { Drawing } from "@amends/ui/primitives/drawing";
import { IconButton } from "@amends/ui/primitives/icon-button";
import { Text } from "@amends/ui/primitives/text";
import { createEffect, Match, Show, Switch } from "solid-js";
import { ReplyComposer } from "./composers.tsx";
import { Entries, type Post } from "./entries.tsx";
import { memberName, typingText } from "./presentation.ts";

export interface ThreadPanelProps {
  readonly workspaceId: string;
  /** The thread's group, whose members replies can mention. */
  readonly groupId: string;
  readonly threadId: string;
  /**
   * The timeline position the reader came to see, such as the message that notified them. The
   * panel reads back far enough to show it, sets it apart, and opens at it.
   */
  readonly focus?: number;
  /** Close the panel; the page owns where that leads. */
  readonly onClose: () => void;
}
type Published = Extract<ThreadTimeline.Item, { readonly message: unknown }>;
const isMessage = (item: ThreadTimeline.Item): item is Published => "message" in item;
/**
 * One thread's messages for the shell's inspector, from the newest and live while mounted, with
 * its header, close action, and a composer for replying. Earlier messages load on request.
 */
export function ThreadPanel(props: ThreadPanelProps) {
  const timeline = useThreadTimeline(props.workspaceId, props.threadId);
  const members = useMembers(props.workspaceId);
  const typing = useTyping(props.workspaceId);
  const typists = () =>
    typingText(typing(props.threadId).map((memberId) => memberName(members.member(memberId))));
  // An open thread is read through the newest activity it shows, as that activity arrives.
  useMarkThreadRead(
    props.workspaceId,
    props.threadId,
    () => timeline.value()?.at(-1)?.activity.sequence,
  );
  const posts = () =>
    (timeline.value() ?? []).filter(isMessage).map((item): Post => ({
      key: item.message.id,
      author: item.message.author,
      publishedAt: item.message.publishedAt,
      text: item.message.text,
      mentions: item.message.mentions,
    }));
  // Read back until the position to show is loaded, one page at a time.
  createEffect(() => {
    const target = props.focus,
      first = timeline.value()?.[0];
    if (target === undefined || first === undefined || timeline.complete()) return;
    if (first.activity.sequence > target && !timeline.loadingEarlier()) timeline.loadEarlier();
  });
  const focused = () => {
    const target = props.focus;
    const item = timeline.value()?.find((entry) => entry.activity.sequence === target);
    return item && isMessage(item) ? item.message.id : undefined;
  };
  const follow = useThreadFollow(props.workspaceId, props.threadId);
  const meta = () => {
    const count = posts().length;
    if (timeline.value() === undefined) return "";
    const messages = timeline.complete()
      ? `${count} ${count === 1 ? "message" : "messages"}`
      : "Latest messages";
    if (follow.error()) return `${messages} · couldn’t change following`;
    return follow.following() ? `${messages} · following` : messages;
  };
  return (
    <>
      <Shell.InspectorHeader>
        <Shell.InspectorHeading>
          <Shell.InspectorTitle>Thread</Shell.InspectorTitle>
          <Shell.InspectorMeta>{meta()}</Shell.InspectorMeta>
        </Shell.InspectorHeading>
        <Show when={follow.following() !== undefined}>
          <Button variant="secondary" pending={follow.pending()} onClick={() => follow.toggle()}>
            {follow.following() ? "Unfollow" : "Follow"}
          </Button>
        </Show>
        <IconButton
          aria-label="Close thread"
          shape="circle"
          size="compact"
          variant="secondary"
          onClick={() => props.onClose()}
        >
          ✕
        </IconButton>
      </Shell.InspectorHeader>
      <Shell.InspectorBody>
        <Switch>
          <Match when={timeline.value() === undefined && timeline.failure()}>
            {(failure) => (
              <EmptyState.Root>
                <Drawing.Snapped />
                <EmptyState.Text>
                  <EmptyState.Title>
                    {failure() === "gone" || failure() === "denied"
                      ? "This thread isn’t available"
                      : "Can’t load this thread"}
                  </EmptyState.Title>
                  <EmptyState.Description>
                    {failure() === "gone" || failure() === "denied"
                      ? "It may be in a group you no longer belong to."
                      : "Try again once the host is reachable."}
                  </EmptyState.Description>
                </EmptyState.Text>
                <Show when={failure() !== "gone" && failure() !== "denied"}>
                  <EmptyState.Actions>
                    <Button onClick={timeline.retry}>Try again</Button>
                  </EmptyState.Actions>
                </Show>
              </EmptyState.Root>
            )}
          </Match>
          <Match when={timeline.value() === undefined}>
            <Text role="status" tone="secondary">
              Loading the thread…
            </Text>
          </Match>
          <Match when={true}>
            <Transcript.Root aria-label="Thread messages">
              <Show when={!timeline.complete()}>
                <Transcript.Earlier>
                  <Button
                    variant="ghost"
                    pending={timeline.loadingEarlier()}
                    onClick={timeline.loadEarlier}
                  >
                    Show earlier messages
                  </Button>
                </Transcript.Earlier>
              </Show>
              <Transcript.Items>
                <Entries posts={posts()} members={members} density="compact" focus={focused()} />
              </Transcript.Items>
              <Transcript.Status>{typists()}</Transcript.Status>
            </Transcript.Root>
            <Composer.Dock surface="panel">
              <ReplyComposer
                workspaceId={props.workspaceId}
                groupId={props.groupId}
                threadId={props.threadId}
              />
            </Composer.Dock>
          </Match>
        </Switch>
      </Shell.InspectorBody>
    </>
  );
}
