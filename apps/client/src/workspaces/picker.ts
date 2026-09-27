import { Exit } from "effect";
import { createMemo, createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { acceptInvitationRequest } from "../api/settings.ts";
import { suggestedName } from "../api/workspaces.ts";
import { toDate } from "../conversations/time.ts";
import { useRequest } from "../request/use-request.ts";
import { useDirectory } from "../session/directory.tsx";
import { useSession } from "../session/provider.tsx";

/** Why accepting failed, or `refresh-failed` when it joined but the directory did not reload. */
export type AcceptInvitationError = WorkspaceFailure | "refresh-failed";

/** An active membership, as the picker lists it. */
export interface WorkspaceEntry {
  readonly id: string;
  readonly name: string;
  /** Active members, the reader included. */
  readonly memberCount: number;
  readonly owner: boolean;
}

/** A pending invitation for the signed-in identity. */
export interface InvitationEntry {
  readonly id: string;
  readonly workspaceId: string;
  /** Absent when the workspace's name is not shared with invitees. */
  readonly workspaceName: string | undefined;
  readonly expiresAt: Date;
}

/** The latest attempt to accept an invitation. */
export interface AcceptAttempt {
  readonly invitationId: string;
  readonly pending: boolean;
  readonly error: AcceptInvitationError | undefined;
  /** The reader is a member now; accepting again only reloads the directory. */
  readonly joined: boolean;
}

export interface WorkspacePickerController {
  readonly workspaces: Accessor<readonly WorkspaceEntry[]>;
  readonly invitations: Accessor<readonly InvitationEntry[]>;
  /** The last reload failed; the lists show what loaded before. */
  readonly refreshFailed: Accessor<boolean>;
  readonly retry: () => void;
  readonly accepting: Accessor<AcceptAttempt | undefined>;
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
      .map((entry): WorkspaceEntry => ({
        id: entry.workspace.id,
        name: entry.workspace.name,
        memberCount: entry.activeMemberCount,
        owner: entry.member.id === entry.workspace.ownerMemberId,
      })),
  );
  const invitations = createMemo(() =>
    (ready()?.listing.invitations ?? []).map((invitation): InvitationEntry => ({
      id: invitation.details.id,
      workspaceId: invitation.details.workspaceId,
      workspaceName: invitation.workspaceName,
      expiresAt: toDate(invitation.details.expiresAt),
    })),
  );
  const [attempt, setAttempt] = createSignal<AcceptAttempt>();
  // Joined invitations whose reload failed; accepting them again only reloads.
  const joined = new Set<string>();
  const request = useRequest(
    acceptInvitationRequest(useApiClient()),
    (exit, input) => {
      if (Exit.isFailure(exit)) {
        setAttempt({
          invitationId: input.invitationId,
          pending: false,
          error: workspaceFailure(exit.cause),
          joined: input.refreshOnly,
        });
        return;
      }
      joined.add(input.invitationId);
      setAttempt({
        invitationId: input.invitationId,
        pending: false,
        error: Exit.isFailure(exit.value.refreshed) ? "refresh-failed" : undefined,
        joined: true,
      });
    },
    { when: () => session.session !== undefined },
  );
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
    accept: (invitationId, name) => {
      const invitation = invitations().find((entry) => entry.id === invitationId);
      if (!invitation || request.pending()) return;
      const previous = attempt(),
        refreshOnly = joined.has(invitationId),
        trimmed = name?.trim();
      setAttempt({ invitationId, pending: true, error: undefined, joined: refreshOnly });
      const started = request.run({
        workspaceId: invitation.workspaceId,
        invitationId,
        ...(trimmed ? { name: trimmed } : {}),
        refreshOnly,
      });
      if (!started) setAttempt(previous);
    },
    suggestedName: () => suggestedName(session.session?.humanId),
  };
}

/** Why the signed-in identity cannot open a workspace. */
export type WorkspaceAccess =
  | { readonly reason: "invited"; readonly workspaceName: string | undefined }
  | { readonly reason: "removed"; readonly workspaceName: string }
  | { readonly reason: "unknown" };

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
