import { useDirectory, type DirectoryScope } from "@amends/client";
import { ItemList } from "@amends/ui/compositions/item-list";
import { WorkspaceMark } from "@amends/ui/primitives/workspace-mark";
import { Button } from "@amends/ui/primitives/button";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createContext, createMemo, For, Show, useContext, type ParentProps } from "solid-js";

const Context = createContext<DirectoryScope>();
const directory = () => {
  const value = useContext(Context);
  if (!value) throw new Error("WorkspacePicker parts require WorkspacePicker.Root.");
  return value;
};
export function Root(props: ParentProps) {
  const value = useDirectory();
  return <Context.Provider value={value}>{props.children}</Context.Provider>;
}
export function Summary() {
  const value = directory();
  const summary = () => {
    const state = value.state();
    if (state._tag !== "Ready") return "";
    const count = state.listing.memberships.filter(
      (entry) => entry.member.status === "active",
    ).length;
    const invitations = state.listing.invitations.length;
    return `${count} ${count === 1 ? "workspace" : "workspaces"}${invitations ? ` · ${invitations} pending ${invitations === 1 ? "invitation" : "invitations"}` : ""}`;
  };
  return <Text tone="secondary">{summary()}</Text>;
}
export function List(props: { workspaceHref: (workspaceId: string) => string }) {
  const value = directory();
  const memberships = createMemo(() => {
    const state = value.state();
    return state._tag === "Ready"
      ? state.listing.memberships.filter((entry) => entry.member.status === "active")
      : [];
  });
  return (
    <Show when={memberships().length}>
      <ItemList.Root aria-label="Your workspaces">
        <For each={memberships()}>
          {(entry) => (
            <ItemList.Item>
              <ItemList.Link href={props.workspaceHref(entry.workspace.id)}>
                <WorkspaceMark decorative>
                  {Array.from(entry.workspace.name)[0]?.toLocaleUpperCase() ?? "?"}
                </WorkspaceMark>
                <ItemList.Content>
                  <ItemList.Title>{entry.workspace.name}</ItemList.Title>
                  <ItemList.Description>
                    {entry.activeMemberCount} {entry.activeMemberCount === 1 ? "member" : "members"}
                    {entry.member.id === entry.workspace.ownerMemberId ? " · Owner" : ""}
                  </ItemList.Description>
                </ItemList.Content>
                <span aria-hidden="true">›</span>
              </ItemList.Link>
            </ItemList.Item>
          )}
        </For>
      </ItemList.Root>
    </Show>
  );
}
export function Empty() {
  const value = directory();
  const empty = () => {
    const state = value.state();
    return (
      state._tag === "Ready" &&
      !state.listing.memberships.some((entry) => entry.member.status === "active")
    );
  };
  return (
    <Show when={empty()}>
      <Column gap={2}>
        <Text as="h2" variant="heading">
          No workspaces yet
        </Text>
        <Text tone="secondary">Create a workspace to get started.</Text>
      </Column>
    </Show>
  );
}
export function Status() {
  const value = directory();
  const busy = () => {
    const state = value.state();
    return state._tag === "Loading" || (state._tag === "Ready" && state.refreshing);
  };
  const failed = () => {
    const state = value.state();
    return state._tag === "Failed" || (state._tag === "Ready" && state.refreshFailed);
  };
  return (
    <Column gap={2}>
      <Show when={busy()}>
        <Text role="status">Loading workspaces…</Text>
      </Show>
      <Show when={failed()}>
        <Text role="alert" tone="danger">
          Couldn’t refresh your workspaces. Try again.
        </Text>
      </Show>
      <Button variant="ghost" pending={busy()} onClick={value.retry}>
        {failed() ? "Try again" : "Refresh workspaces"}
      </Button>
    </Column>
  );
}
