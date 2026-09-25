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
import { createContext, For, Show, useContext, type ParentProps } from "solid-js";
import { keyed } from "../internal/keyed.ts";

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
type Membership = Extract<
  ReturnType<DirectoryScope["state"]>,
  { _tag: "Ready" }
>["listing"]["memberships"][number];
function WorkspaceRow(props: { entry: Membership; href: string }) {
  return (
    <ItemList.Item>
      <ItemList.Link href={props.href}>
        <ItemList.Leading>
          <WorkspaceMark decorative>
            {Array.from(props.entry.workspace.name)[0]?.toLocaleUpperCase() ?? "?"}
          </WorkspaceMark>
        </ItemList.Leading>
        <ItemList.Content>
          <ItemList.Title>{props.entry.workspace.name}</ItemList.Title>
          <ItemList.Description>
            {props.entry.activeMemberCount}{" "}
            {props.entry.activeMemberCount === 1 ? "member" : "members"}
            {props.entry.member.id === props.entry.workspace.ownerMemberId ? " · Owner" : ""}
          </ItemList.Description>
        </ItemList.Content>
      </ItemList.Link>
    </ItemList.Item>
  );
}
export function List(props: { workspaceHref: (workspaceId: string) => string }) {
  const value = directory();
  const memberships = keyed(
    () => {
      const state = value.state();
      return state._tag === "Ready"
        ? state.listing.memberships.filter((entry) => entry.member.status === "active")
        : [];
    },
    (entry) => entry.workspace.id,
  );
  return (
    <Show when={memberships.ids().length}>
      <ItemList.Root aria-label="Your workspaces">
        <For each={memberships.ids()}>
          {(id) => (
            <Show when={memberships.get(id)}>
              {(entry) => <WorkspaceRow entry={entry()} href={props.workspaceHref(id)} />}
            </Show>
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
  invitation: Extract<
    ReturnType<DirectoryScope["state"]>,
    { _tag: "Ready" }
  >["listing"]["invitations"][number];
}) {
  // A row is keyed by invitation, so its identity is fixed; its details may still refresh.
  const value = useAcceptInvitation(
    props.invitation.details.workspaceId,
    props.invitation.details.id,
  );
  return (
    <ItemList.Item>
      <ItemList.Row>
        <ItemList.Content>
          <ItemList.Title>
            {props.invitation.workspaceName ?? "Workspace invitation"}
          </ItemList.Title>
          <ItemList.Description>For {props.invitation.details.recipientId}</ItemList.Description>
          <ItemList.Description>
            Expires {formatInstant(props.invitation.details.expiresAt)}
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
  const invitations = keyed(
    () => {
      const state = value.state();
      return state._tag === "Ready" ? state.listing.invitations : [];
    },
    (invitation) => invitation.details.id,
  );
  return (
    <Show when={invitations.ids().length}>
      <Column gap={3}>
        <Text as="h2" variant="heading">
          Invitations
        </Text>
        <ItemList.Root aria-label="Your invitations">
          <For each={invitations.ids()}>
            {(id) => (
              <Show when={invitations.get(id)}>
                {(invitation) => <InvitationEntry invitation={invitation()} />}
              </Show>
            )}
          </For>
        </ItemList.Root>
      </Column>
    </Show>
  );
}
