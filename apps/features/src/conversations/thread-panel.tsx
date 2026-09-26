import { useMembers, useThreadTimeline, type ThreadTimeline } from "@amends/client";
import { EmptyState } from "@amends/ui/compositions/empty-state";
import { Shell } from "@amends/ui/compositions/shell";
import { Transcript } from "@amends/ui/compositions/transcript";
import { Button } from "@amends/ui/primitives/button";
import { Drawing } from "@amends/ui/primitives/drawing";
import { IconButton } from "@amends/ui/primitives/icon-button";
import { Text } from "@amends/ui/primitives/text";
import { Match, Show, Switch } from "solid-js";
import { Entries, type Post } from "./entries.tsx";

export interface ThreadPanelProps {
  readonly workspaceId: string;
  readonly threadId: string;
  /** Close the panel; the page owns where that leads. */
  readonly onClose: () => void;
}
type Published = Extract<ThreadTimeline.Item, { readonly message: unknown }>;
const isMessage = (item: ThreadTimeline.Item): item is Published => "message" in item;
/**
 * One thread's messages for the shell's inspector, from the newest and live while mounted, with
 * its header and close action. Earlier messages load on request.
 */
export function ThreadPanel(props: ThreadPanelProps) {
  const timeline = useThreadTimeline(props.workspaceId, props.threadId);
  const members = useMembers(props.workspaceId);
  const posts = () =>
    (timeline.value() ?? []).filter(isMessage).map((item): Post => ({
      key: item.message.id,
      author: item.message.author,
      publishedAt: item.message.publishedAt,
      text: item.message.text,
    }));
  const meta = () => {
    const count = posts().length;
    if (timeline.value() === undefined) return "";
    if (!timeline.complete()) return "Latest messages";
    return `${count} ${count === 1 ? "message" : "messages"}`;
  };
  return (
    <>
      <Shell.InspectorHeader>
        <Shell.InspectorHeading>
          <Shell.InspectorTitle>Thread</Shell.InspectorTitle>
          <Shell.InspectorMeta>{meta()}</Shell.InspectorMeta>
        </Shell.InspectorHeading>
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
                <Entries posts={posts()} members={members} density="compact" />
              </Transcript.Items>
            </Transcript.Root>
          </Match>
        </Switch>
      </Shell.InspectorBody>
    </>
  );
}
