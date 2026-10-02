import type {
  AcceptInvitationError,
  PickerAccept,
  PickerInvitation,
  PickerWorkspace,
} from "@amends/ui/screens/workspaces";
import type { WorkspaceAccess } from "@amends/ui/screens/standalone";
import { Exit } from "effect";
import { createMemo, createSignal, type Accessor } from "solid-js";
import { directoryQuery } from "../api/directory.ts";
import { workspaceFailure } from "../api/failures.ts";
import { useMutation } from "../api/mutation.ts";
import { refreshResult } from "../api/refresh.ts";
import { acceptInvitation, suggestedName } from "./api.ts";
import { toDate } from "../conversations/time.ts";
import { useApiClient, useSession } from "../provider.tsx";
import { useDirectory } from "../session/directory.tsx";

export interface WorkspacePickerController {
  /** Active memberships; the app gives each its link. */
  readonly workspaces: Accessor<readonly Omit<PickerWorkspace, "href">[]>;
  readonly invitations: Accessor<readonly PickerInvitation[]>;
  /** The last reload failed; the lists show what loaded before. */
  readonly refreshFailed: Accessor<boolean>;
  readonly retry: () => void;
  readonly accepting: Accessor<PickerAccept | undefined>;
  /** Join as `name`, or as the identity when it is blank. One attempt runs at a time. */
  readonly accept: (invitationId: string, name?: string) => void;
  /** A first name to offer when joining, from the identity. */
  readonly suggestedName: Accessor<string>;
}

/** The directory as the workspace picker shows it, and accepting its invitations. */
export function useWorkspacePicker(): WorkspacePickerController {
  const session = useSession();
  const directory = useDirectory();
  const ready = () => {
    const state = directory.state();
    return state._tag === "Ready" ? state : undefined;
  };
  const workspaces = createMemo(() =>
    (ready()?.listing.memberships ?? [])
      .filter((entry) => entry.member.status === "active")
      .map((entry): Omit<PickerWorkspace, "href"> => ({
        id: entry.workspace.id,
        name: entry.workspace.name,
        memberCount: entry.activeMemberCount,
        owner: entry.member.id === entry.workspace.ownerMemberId,
      })),
  );
  const invitations = createMemo(() =>
    (ready()?.listing.invitations ?? []).map((invitation): PickerInvitation => ({
      id: invitation.details.id,
      workspaceId: invitation.details.workspaceId,
      workspaceName: invitation.workspaceName,
      expiresAt: toDate(invitation.details.expiresAt),
    })),
  );
  const [attempt, setAttempt] = createSignal<PickerAccept>();
  // Joined invitations whose reload failed; accepting them again only reloads.
  const joined = new Set<string>();
  const join = useMutation(acceptInvitation);
  const client = useApiClient();
  const reload = useMutation(() => refreshResult(directoryQuery(client)));
  /** Join, unless already joined, then reload the directory so the workspace shows. */
  async function accept(invitationId: string, name?: string) {
    const invitation = invitations().find((entry) => entry.id === invitationId);
    if (!invitation || attempt()?.pending) return;
    const settle = (error: AcceptInvitationError | undefined, member: boolean) =>
      setAttempt({ invitationId, pending: false, error, joined: member });
    setAttempt({ invitationId, pending: true, error: undefined, joined: joined.has(invitationId) });
    if (!joined.has(invitationId)) {
      const trimmed = name?.trim();
      const exit = await join.run({
        workspaceId: invitation.workspaceId,
        invitationId,
        ...(trimmed ? { name: trimmed } : {}),
      });
      if (exit === undefined) return;
      if (Exit.isFailure(exit)) return settle(workspaceFailure(exit.cause), false);
      joined.add(invitationId);
    }
    const reloaded = await reload.run();
    if (reloaded === undefined) return;
    settle(Exit.isFailure(reloaded) ? "refresh-failed" : undefined, true);
  }
  const accepting = createMemo(() => {
    const current = attempt();
    // A later reload that drops the invitation settles a failed one.
    if (
      current?.error === "refresh-failed" &&
      !invitations().some((invitation) => invitation.id === current.invitationId)
    )
      return { ...current, error: undefined };
    return current;
  });
  return {
    workspaces,
    invitations,
    refreshFailed: () => ready()?.refreshFailed ?? false,
    retry: directory.retry,
    accepting,
    accept: (invitationId, name) => void accept(invitationId, name),
    suggestedName: () => suggestedName(session.session?.humanId),
  };
}

/**
 * For a workspace without an active membership: an invitation not yet accepted, a membership that
 * ended, or no record at all. An invitation is the way back in, so it outranks an ended membership.
 */
export function useWorkspaceAccess(workspaceId: Accessor<string>): Accessor<WorkspaceAccess> {
  const directory = useDirectory();
  return createMemo((): WorkspaceAccess => {
    const state = directory.state();
    if (state._tag !== "Ready") return { reason: "unknown" };
    const invitation = state.listing.invitations.find(
      (entry) => entry.details.workspaceId === workspaceId(),
    );
    if (invitation) return { reason: "invited", workspaceName: invitation.workspaceName };
    const membership = state.listing.memberships.find(
      (entry) => entry.workspace.id === workspaceId() && entry.member.status === "removed",
    );
    if (membership) return { reason: "removed", workspaceName: membership.workspace.name };
    return { reason: "unknown" };
  });
}
