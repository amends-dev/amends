import { useDirectory, useSession } from "@amends/client";
import { Notice } from "@amends/ui/compositions/notice";
import { Text } from "@amends/ui/primitives/text";
import {
  createContext,
  createMemo,
  Match,
  Switch,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js";

type Access =
  | { readonly reason: "invited"; readonly name: string | undefined }
  | { readonly reason: "removed"; readonly name: string }
  | { readonly reason: "unknown" };
const Context = createContext<Accessor<Access>>();
function access() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkspaceUnavailable parts require WorkspaceUnavailable.Root.");
  return value;
}

/**
 * Explains why the signed-in identity cannot open a workspace, from the directory: an invitation
 * not yet accepted, a membership that ended, or no record at all. Mount inside DirectoryProvider;
 * the app owns the page, header, and navigation.
 */
export function Root(props: ParentProps<{ workspaceId: string }>) {
  const directory = useDirectory();
  const value = createMemo<Access>(() => {
    const state = directory.state();
    if (state._tag !== "Ready") return { reason: "unknown" };
    // An invitation is the way back in, so it outranks an ended membership.
    const invitation = state.listing.invitations.find(
      (entry) => entry.details.workspaceId === props.workspaceId,
    );
    if (invitation) return { reason: "invited", name: invitation.workspaceName };
    const membership = state.listing.memberships.find(
      (entry) => entry.workspace.id === props.workspaceId && entry.member.status === "removed",
    );
    if (membership) return { reason: "removed", name: membership.workspace.name };
    return { reason: "unknown" };
  });
  return <Context.Provider value={value}>{props.children}</Context.Provider>;
}

export function Heading(props: { readonly headingAs?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" }) {
  const value = access();
  return (
    <Text as={props.headingAs ?? "h1"} variant="heading">
      {value().reason === "invited"
        ? "You haven’t joined this workspace yet"
        : "That workspace is closed to you"}
    </Text>
  );
}

/** The state, as a Notice: pending for an invitation, danger when access ended or never existed. */
export function Reason() {
  const value = access();
  const session = useSession();
  const invited = createMemo(() => {
    const current = value();
    return current.reason === "invited" ? current : undefined;
  });
  const removed = createMemo(() => {
    const current = value();
    return current.reason === "removed" ? current : undefined;
  });
  return (
    <Switch>
      <Match when={invited()}>
        {(invitation) => (
          <Notice.Root tone="pending">
            <Notice.Label>Invitation waiting</Notice.Label>
            <Notice.Body>
              You’ve been invited to {invitation().name ?? "this workspace"}. Accept the invitation
              from your workspaces to open it.
            </Notice.Body>
          </Notice.Root>
        )}
      </Match>
      <Match when={removed()}>
        {(membership) => (
          <Notice.Root tone="danger">
            <Notice.Label>No longer a member</Notice.Label>
            <Notice.Body>
              Your membership of {membership().name} has ended. The work you did stays on that
              workspace’s record; you cannot open it.
            </Notice.Body>
          </Notice.Root>
        )}
      </Match>
      <Match when={value().reason === "unknown"}>
        <Notice.Root tone="danger">
          <Notice.Label>No access</Notice.Label>
          <Notice.Body>
            This workspace doesn’t exist, or it hasn’t been shared with{" "}
            {session.session?.humanId ?? "this address"}.
          </Notice.Body>
        </Notice.Root>
      </Match>
    </Switch>
  );
}

/** What would let the reader in, when the reason alone does not say. */
export function Hint() {
  const value = access();
  return (
    <Switch>
      <Match when={value().reason === "removed"}>
        <Text tone="secondary">Rejoining needs a fresh invitation.</Text>
      </Match>
      <Match when={value().reason === "unknown"}>
        <Text tone="secondary">Ask a member to invite this address.</Text>
      </Match>
    </Switch>
  );
}
