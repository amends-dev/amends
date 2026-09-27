import { useJoinGroup, usePublicGroups, type WorkspaceFailure } from "@amends/client";
import { EmptyState } from "@amends/ui/compositions/empty-state";
import { ItemList } from "@amends/ui/compositions/item-list";
import { Button } from "@amends/ui/primitives/button";
import { Drawing } from "@amends/ui/primitives/drawing";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { For, Match, Show, Switch } from "solid-js";
import { keyed } from "../internal/keyed.ts";

const messages: { readonly [Failure in WorkspaceFailure]: string } = {
  changed: "That group changed meanwhile. Try again.",
  denied: "You can no longer join groups here.",
  gone: "That group is no longer public, or no longer exists.",
  invalid: "That group can’t be joined.",
  failed: "Couldn’t join. Try again when the host is available.",
};
export interface PublicGroupsProps {
  readonly workspaceId: string;
  /** Where each group the reader belongs to leads. */
  readonly href: (groupId: string) => string;
  /** The reader joined a group; the app decides where that leads. */
  readonly onJoined: (groupId: string) => void;
}
const size = (members: number) => `${members} ${members === 1 ? "member" : "members"}`;
/**
 * The workspace's public groups by name, live while mounted: each one the reader belongs to leads
 * to it, and the rest offer Join. Their threads open once the reader joins.
 */
export function PublicGroups(props: PublicGroupsProps) {
  const groups = usePublicGroups(props.workspaceId);
  const join = useJoinGroup(props.workspaceId, (groupId) => props.onJoined(groupId));
  // Rows follow group IDs, so a live refresh keeps each row and its focus.
  const rows = keyed(
    () =>
      (groups.value() ?? []).toSorted((left, right) =>
        left.group.name.localeCompare(right.group.name),
      ),
    (item) => item.group.id,
  );
  const failed = () => (groups.value() === undefined ? groups.failure() : undefined);
  return (
    <Switch>
      <Match when={failed()}>
        {(failure) => (
          <EmptyState.Root>
            <Drawing.Snapped />
            <EmptyState.Text>
              <EmptyState.Title>
                {failure() === "denied" || failure() === "gone"
                  ? "You can’t browse groups here"
                  : "Can’t load the groups"}
              </EmptyState.Title>
              <EmptyState.Description>
                {failure() === "denied" || failure() === "gone"
                  ? "Ask someone who manages this workspace to add you to groups."
                  : "Try again once the host is reachable."}
              </EmptyState.Description>
            </EmptyState.Text>
            <Show when={failure() !== "denied" && failure() !== "gone"}>
              <EmptyState.Actions>
                <Button onClick={groups.retry}>Try again</Button>
              </EmptyState.Actions>
            </Show>
          </EmptyState.Root>
        )}
      </Match>
      <Match when={groups.value() === undefined}>
        <Text role="status" tone="secondary">
          Loading groups…
        </Text>
      </Match>
      <Match when={rows.ids().length === 0}>
        <EmptyState.Root>
          <Drawing.Bare />
          <EmptyState.Text>
            <EmptyState.Title>No public groups yet</EmptyState.Title>
            <EmptyState.Description>
              When someone makes a group public, it shows up here for anyone to join.
            </EmptyState.Description>
          </EmptyState.Text>
        </EmptyState.Root>
      </Match>
      <Match when={true}>
        <Column gap={4}>
          <ItemList.Root aria-label="Public groups">
            <For each={rows.ids()}>
              {(id) => {
                const item = () => rows.get(id)!;
                return (
                  <ItemList.Item>
                    <Show
                      when={item().joined}
                      fallback={
                        <ItemList.Row>
                          <ItemList.Leading>#</ItemList.Leading>
                          <ItemList.Content>
                            <ItemList.Title>{item().group.name}</ItemList.Title>
                            <ItemList.Description>{size(item().members)}</ItemList.Description>
                          </ItemList.Content>
                          <ItemList.Actions>
                            <Button
                              variant="secondary"
                              aria-label={`Join ${item().group.name}`}
                              pending={join.joining() === id}
                              disabled={join.joining() !== undefined && join.joining() !== id}
                              onClick={() => join.join(id)}
                            >
                              Join
                            </Button>
                          </ItemList.Actions>
                        </ItemList.Row>
                      }
                    >
                      <ItemList.Link href={props.href(id)}>
                        <ItemList.Leading>#</ItemList.Leading>
                        <ItemList.Content>
                          <ItemList.Title>{item().group.name}</ItemList.Title>
                          <ItemList.Description>{size(item().members)}</ItemList.Description>
                        </ItemList.Content>
                        <ItemList.Meta>joined</ItemList.Meta>
                      </ItemList.Link>
                    </Show>
                  </ItemList.Item>
                );
              }}
            </For>
          </ItemList.Root>
          <Show when={join.error()}>
            {(error) => (
              <Text role="alert" tone="danger">
                {messages[error().failure]}
              </Text>
            )}
          </Show>
        </Column>
      </Match>
    </Switch>
  );
}
