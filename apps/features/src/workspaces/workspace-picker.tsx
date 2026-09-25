import {
  useDirectory,
  useAcceptInvitation,
  formatInstant,
  type DirectoryScope,
} from "@amends/client";
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
                <ItemList.Leading>
                  <WorkspaceMark decorative>
                    {Array.from(entry.workspace.name)[0]?.toLocaleUpperCase() ?? "?"}
                  </WorkspaceMark>
                </ItemList.Leading>
                <ItemList.Content>
                  <ItemList.Title>{entry.workspace.name}</ItemList.Title>
                  <ItemList.Description>
                    {entry.activeMemberCount} {entry.activeMemberCount === 1 ? "member" : "members"}
                    {entry.member.id === entry.workspace.ownerMemberId ? " · Owner" : ""}
                  </ItemList.Description>
                </ItemList.Content>
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
    <Show when={busy() || failed()}>
      <Column gap={2}>
        <Show when={busy()}>
          <Text role="status">Loading workspaces…</Text>
        </Show>
        <Show when={failed()}>
          <Text role="alert" tone="danger">
            Couldn’t refresh your workspaces. Try again.
          </Text>
          <Button variant="ghost" onClick={value.retry}>
            Try again
          </Button>
        </Show>
      </Column>
    </Show>
  );
}
function InvitationEntry(props: {
  invitation: NonNullable<
    ReturnType<DirectoryScope["state"]> & { _tag: "Ready" }
  >["listing"]["invitations"][number];
}) {
  const invitation = props.invitation;
  const value = useAcceptInvitation(invitation.details.workspaceId, invitation.details.id);
  return (
    <ItemList.Item>
      <ItemList.Row>
        <ItemList.Content>
          <ItemList.Title>{invitation.workspaceName ?? "Workspace invitation"}</ItemList.Title>
          <ItemList.Description>For {invitation.details.recipientId}</ItemList.Description>
          <ItemList.Description>
            Expires {formatInstant(invitation.details.expiresAt)}
          </ItemList.Description>
          <Show when={value.error()}>
            <Text role="alert" tone="danger">
              {value.error()}
            </Text>
          </Show>
        </ItemList.Content>
        <ItemList.Actions>
          <Button pending={value.pending()} onClick={value.accept}>
            {value.completed() ? "Try again" : "Accept invitation"}
          </Button>
        </ItemList.Actions>
      </ItemList.Row>
    </ItemList.Item>
  );
}
export function Invitations() {
  const value = directory();
  const invitations = createMemo(() => {
    const state = value.state();
    return state._tag === "Ready" ? state.listing.invitations : [];
  });
  return (
    <Show when={invitations().length}>
      <Column gap={3}>
        <Text as="h2" variant="heading">
          Invitations
        </Text>
        <ItemList.Root aria-label="Your invitations">
          <For each={invitations()}>
            {(invitation) => <InvitationEntry invitation={invitation} />}
          </For>
        </ItemList.Root>
      </Column>
    </Show>
  );
}
