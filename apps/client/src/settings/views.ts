import { DateTime } from "effect";
import { createEffect, createMemo, createSignal, on } from "solid-js";
import type { Member } from "../api/conversations.ts";
import {
  invitationIntent,
  type SettingsCommand,
  type SettingsData,
  type SettingsSection,
} from "../api/settings.ts";
import { memberName, usePeople } from "../conversations/views.ts";
import { toDate } from "../conversations/time.ts";
import { useWorkspace } from "../session/directory.tsx";
import { useSettings, type SettingsChange, type SettingsError } from "./controller.ts";

/** A change the reader can make in settings. */
export type SettingsAction = SettingsChange["kind"];

/** A change that completed and whose result is shown. */
export interface SettingsDone {
  readonly action: SettingsAction;
  /** Whom it concerned by name: the member, the new owner, or the invitation's recipient. */
  readonly subject?: string;
  /** The invitation it created. */
  readonly created?: string;
}

/**
 * Why the reader's last change, or a read, failed. `refresh` covers reads: a live refresh that
 * failed, or values found out of date after the change that found them was set aside.
 */
export interface SettingsFailure {
  readonly action: SettingsAction | "refresh";
  readonly error: SettingsError;
}

/** Someone in the workspace, as settings shows them. */
export interface SettingsPerson {
  readonly id: string;
  readonly name: string;
  readonly agent: boolean;
  /** The reader. */
  readonly you: boolean;
}

export interface SettingsRole {
  readonly id: string;
  readonly name: string;
}

/** Access a member holds: a role or one permission, across the workspace or on one target. */
export interface SettingsAccess {
  readonly id: string;
  /** The role's name, or the permission's. */
  readonly name: string;
  readonly scope: "workspace" | "target";
  readonly active: boolean;
}

/** A workspace member, as the roster and their details show them. */
export interface SettingsMember extends SettingsPerson {
  /** What they sign in as, such as an email address. */
  readonly signIn: string;
  readonly status: "active" | "removed";
  /** Their workspace role, when the reader may read their access and they hold one. */
  readonly role: SettingsRole | undefined;
  /** The roles the reader may give them; empty when the reader may not change their role. */
  readonly roles: readonly SettingsRole[];
  /** What they may do, when the reader may read it. */
  readonly access: readonly SettingsAccess[] | undefined;
  readonly removable: boolean;
}

export type SettingsInvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export interface SettingsInvitation {
  readonly id: string;
  /** The sign-in email it was issued to. */
  readonly recipient: string;
  /** The role it gives, by name. */
  readonly role: string;
  readonly status: SettingsInvitationStatus;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly revocable: boolean;
}

/** Which members the roster lists. */
export type MemberFilter = "active" | "removed";

type Entry = SettingsData["members"][number];
const workspaceRoles = (entry: Entry) =>
  entry.access?.assignments.filter(
    (assignment) =>
      assignment.status === "active" &&
      assignment.source._tag === "Role" &&
      assignment.source.scope._tag === "Workspace",
  ) ?? [];
const statusOf = (
  invitation: SettingsData["invitations"][number],
  now: number,
): SettingsInvitationStatus => {
  if (invitation.state._tag === "Accepted") return "accepted";
  if (invitation.state._tag === "Revoked") return "revoked";
  return DateTime.toEpochMillis(invitation.details.expiresAt) <= now ? "expired" : "pending";
};

/**
 * One tab of a workspace's settings, live while mounted: the workspace's name, owner, and details,
 * or its members and invitations. Each change keeps what it was made against, so a change saved
 * elsewhere meanwhile conflicts instead of being overwritten; the reader then refreshes, reviews,
 * and saves again with their draft kept. `done` hears each change once its result is shown.
 */
export function useWorkspaceSettings(
  workspaceId: string,
  section: SettingsSection,
  options: { readonly done?: (done: SettingsDone) => void } = {},
) {
  const membership = useWorkspace(() => workspaceId);
  const people = usePeople(workspaceId);
  const selfId = () => membership()?.member.id as string | undefined;
  // The change running or last run, with whom it concerned, until it settles or is set aside.
  const [attempt, setAttempt] = createSignal<{
    readonly action: SettingsAction | "refresh";
    readonly subject?: string;
  }>();
  const [running, setRunning] = createSignal<SettingsAction | "refresh">();
  const settings = useSettings(workspaceId, section, {
    settled: (change, created) => {
      const subject = attempt()?.subject;
      setAttempt(undefined);
      if (change.kind === "rename") setName(undefined);
      if (change.kind === "role") setRole(undefined);
      if (change.kind === "transfer") setTransfer(undefined);
      if (change.kind === "invite") {
        intent = undefined;
        setInvite({ recipient: "", roleId: undefined });
      }
      options.done?.({ action: change.kind, subject, created });
    },
  });
  const data = settings.data;
  const send = (command: SettingsCommand, subject?: string) => {
    if (settings.pending() || (settings.needsRefresh() && command.kind !== "refresh")) return;
    setAttempt({ action: command.kind, subject });
    setRunning(command.kind);
    settings.send(command);
  };

  const person = (member: Member.Record): SettingsPerson => ({
    id: member.id,
    name: memberName(member),
    agent: member.identity._tag === "Agent",
    you: member.id === selfId(),
  });
  const memberOf = (entry: Entry): SettingsMember => {
    const access = entry.access;
    // A closed membership holds no access, whatever its assignments still record.
    const current = entry.member.status === "active" ? access : null;
    const assigned = workspaceRoles(entry)[0];
    const roleId = assigned?.source._tag === "Role" ? assigned.source.roleId : undefined;
    const role =
      roleId === undefined
        ? undefined
        : {
            id: roleId,
            name: access?.roles.find((choice) => choice.role.id === roleId)?.role.name ?? roleId,
          };
    const assignable =
      access?.roles
        .filter((choice) => choice.assignable)
        .map((choice) => ({ id: choice.role.id, name: choice.role.name })) ?? [];
    // A role the reader may not give, such as Owner, changes only by transferring ownership.
    const editable =
      access?.canManage === true &&
      entry.member.status === "active" &&
      (role === undefined || assignable.some((choice) => choice.id === role.id));
    return {
      ...person(entry.member),
      signIn: entry.member.identity.id,
      status: entry.member.status,
      role,
      roles: editable ? assignable : [],
      access: current?.assignments.map(({ id, source, status }): SettingsAccess => {
        const scope = source._tag === "Role" ? source.scope : source.grant.scope;
        return {
          id,
          name:
            source._tag === "Role"
              ? (current.roles.find((choice) => choice.role.id === source.roleId)?.role.name ??
                source.roleId)
              : source.grant.permission,
          scope: scope._tag === "Workspace" ? "workspace" : "target",
          active: status === "active",
        };
      }),
      removable: entry.canRemove,
    };
  };
  const byName = (left: SettingsPerson, right: SettingsPerson) =>
    left.name.localeCompare(right.name);
  // The reader first, then everyone by name.
  const roster = createMemo(() =>
    (data()?.members ?? [])
      .map(memberOf)
      .toSorted((left, right) => Number(right.you) - Number(left.you) || byName(left, right)),
  );
  const [query, setQuery] = createSignal("");
  const [filter, setFilter] = createSignal<MemberFilter>("active");
  const members = createMemo(() => {
    const words = query().trim().toLowerCase();
    return roster().filter(
      (member) =>
        member.status === filter() &&
        (words === "" ||
          member.name.toLowerCase().includes(words) ||
          member.signIn.toLowerCase().includes(words)),
    );
  });
  const invitations = createMemo(() => {
    const now = Date.now();
    return (data()?.invitations ?? [])
      .map((invitation): SettingsInvitation => {
        const status = statusOf(invitation, now);
        const role = data()?.settings.roles.find(
          (choice) => choice.role.id === invitation.details.roleId,
        );
        return {
          id: invitation.details.id,
          recipient: invitation.details.recipientId,
          role: role?.role.name ?? invitation.details.roleId,
          status,
          issuedAt: toDate(invitation.details.issuedAt),
          expiresAt: toDate(invitation.details.expiresAt),
          revocable: status === "pending" && role?.assignable === true,
        };
      })
      .toSorted((left, right) => right.issuedAt.getTime() - left.issuedAt.getTime());
  });

  // Rename: the draft keeps the name it was made against.
  const [name, setName] = createSignal<{ readonly name: string; readonly expected: string }>();
  const storedName = () => data()?.settings.workspace.name ?? "";
  // Ownership: the transfer keeps the ownership it was chosen against.
  const [transfer, setTransfer] = createSignal<{
    readonly memberId: string | undefined;
    readonly expected: string;
  }>();
  // A role: the choice keeps the assignments it was made against.
  const [role, setRole] = createSignal<{
    readonly memberId: string;
    readonly roleId: string;
    readonly expected: ReadonlyArray<string>;
  }>();
  const assignmentsOf = (memberId: string) => {
    const entry = data()?.members.find((candidate) => candidate.member.id === memberId);
    return entry ? workspaceRoles(entry).map((assignment) => assignment.id) : [];
  };
  // An invitation: retrying the same recipient and role reuses its request key, so an attempt
  // whose response was lost is not issued twice.
  const [invite, setInvite] = createSignal<{
    readonly recipient: string;
    readonly roleId: string | undefined;
  }>({ recipient: "", roleId: undefined });
  let intent: ReturnType<typeof invitationIntent> | undefined;
  const inviteRoles = createMemo(() =>
    (data()?.settings.roles ?? [])
      .filter((choice) => choice.assignable)
      .map((choice) => ({ id: choice.role.id, name: choice.role.name })),
  );

  // After an explicit refresh, drafts stay and are made against what the reader now reviews.
  createEffect(
    on(
      settings.revision,
      () => {
        const draft = name();
        if (draft) setName({ ...draft, expected: storedName() });
        const chosen = transfer();
        const ownership = data()?.ownership;
        if (chosen && ownership) setTransfer({ ...chosen, expected: ownership.ownerAssignmentId });
        const edit = role();
        if (edit) setRole({ ...edit, expected: assignmentsOf(edit.memberId) });
      },
      { defer: true },
    ),
  );

  return {
    /** Why nothing shows yet; undefined once the settings have loaded. */
    status: (): "loading" | "failed" | "unavailable" | undefined => {
      if (data() !== undefined) return undefined;
      const error = settings.error();
      if (settings.pending() || error === undefined) return "loading";
      return error === "denied" || error === "gone" ? "unavailable" : "failed";
    },
    workspace: createMemo(() => {
      const view = data()?.settings;
      if (!view) return undefined;
      const creator = people
        .all()
        ?.find((member) => member.identity.id === view.workspace.createdBy);
      return {
        id: view.workspace.id as string,
        name: view.workspace.name as string,
        creator: creator
          ? person(creator)
          : {
              id: view.workspace.createdBy,
              name: view.workspace.createdBy,
              agent: false,
              you: false,
            },
      };
    }),
    /** Active members, as the workspace directory counts them. */
    memberCount: () =>
      membership()?.activeMemberCount ??
      roster().filter((member) => member.status === "active").length,
    permissions: () => ({
      rename: data()?.settings.canRename ?? false,
      invite: data()?.settings.canInvite ?? false,
      invitations: data()?.settings.canReadInvitations ?? false,
      transfer: data()?.ownership.canTransfer ?? false,
    }),
    owner: createMemo(() => {
      const owner = data()?.ownership.owner;
      return owner && person(owner);
    }),
    /** Who ownership may move to. */
    candidates: createMemo(() => (data()?.ownership.candidates ?? []).map(person).toSorted(byName)),
    /** The roster after the search and filter. */
    members,
    /** A member by id, whatever the search and filter. */
    member: (memberId: string) => roster().find((member) => member.id === memberId),
    query,
    setQuery,
    filter,
    setFilter,
    /** Every invitation the reader may read, newest first. */
    invitations,
    /** The change running, or `refresh`. */
    pending: () => (settings.pending() && data() !== undefined ? running() : undefined),
    failure: (): SettingsFailure | undefined => {
      const error = settings.error();
      if (error === undefined || data() === undefined) return undefined;
      const current = attempt();
      if (current) return { action: current.action, error };
      return error === "outdated" || settings.needsRefresh()
        ? { action: "refresh", error }
        : undefined;
    },
    /** What the reader sees is out of date: changes wait for a refresh. */
    stale: settings.needsRefresh,
    /** Reload, on behalf of the change that found the values out of date, if any. */
    refresh: () => {
      if (settings.pending()) return;
      if (!settings.needsRefresh() || !attempt()) setAttempt({ action: "refresh" });
      setRunning("refresh");
      settings.refresh();
    },
    /** Set aside the last change's failure, such as when its dialog closes. */
    dismiss: () => {
      if (!settings.pending()) setAttempt(undefined);
    },
    rename: {
      name: () => name()?.name ?? storedName(),
      setName: (value: string) =>
        setName({ name: value, expected: name()?.expected ?? storedName() }),
      /** The name differs from the one saved and can be saved now. */
      changed: () => {
        const draft = name()?.name.trim();
        return (
          !settings.needsRefresh() && draft !== undefined && draft !== "" && draft !== storedName()
        );
      },
      save: () => {
        const draft = name();
        if (draft) send({ kind: "rename", name: draft.name.trim(), expectedName: draft.expected });
      },
    },
    transfer: {
      /** Start choosing a new owner against the current ownership. */
      begin: () => {
        const ownership = data()?.ownership;
        setAttempt(undefined);
        if (ownership) setTransfer({ memberId: undefined, expected: ownership.ownerAssignmentId });
      },
      chosen: () => transfer()?.memberId,
      choose: (memberId: string) => {
        const chosen = transfer();
        if (chosen) setTransfer({ ...chosen, memberId });
      },
      save: () => {
        const chosen = transfer();
        if (!chosen?.memberId) return;
        const candidate = data()?.ownership.candidates.find(
          (member) => member.id === chosen.memberId,
        );
        send(
          {
            kind: "transfer",
            memberId: chosen.memberId,
            expectedOwnerAssignmentId: chosen.expected,
          },
          candidate && memberName(candidate),
        );
      },
    },
    role: {
      /** The member's chosen role, or their current one. */
      of: (memberId: string) => {
        const edit = role();
        return edit?.memberId === memberId
          ? edit.roleId
          : roster().find((member) => member.id === memberId)?.role?.id;
      },
      choose: (memberId: string, roleId: string) => {
        const edit = role();
        setRole({
          memberId,
          roleId,
          expected: edit?.memberId === memberId ? edit.expected : assignmentsOf(memberId),
        });
      },
      /** The member's chosen role differs from their current one and can be saved now. */
      changed: (memberId: string) => {
        const edit = role();
        return (
          !settings.needsRefresh() &&
          edit?.memberId === memberId &&
          edit.roleId !== roster().find((member) => member.id === memberId)?.role?.id
        );
      },
      save: (memberId: string) => {
        const edit = role();
        if (edit?.memberId !== memberId) return;
        send(
          { kind: "role", memberId, roleId: edit.roleId, expectedAssignmentIds: edit.expected },
          roster().find((member) => member.id === memberId)?.name,
        );
      },
      /** Drop the choice, such as when the member's details close. */
      reset: () => setRole(undefined),
    },
    remove: (memberId: string) =>
      send({ kind: "remove", memberId }, roster().find((member) => member.id === memberId)?.name),
    invite: {
      /** Start a new invitation for the first role the reader may give. */
      begin: () => {
        setAttempt(undefined);
        setInvite({ recipient: "", roleId: inviteRoles()[0]?.id });
      },
      recipient: () => invite().recipient,
      setRecipient: (recipient: string) => setInvite({ ...invite(), recipient }),
      role: () => invite().roleId ?? inviteRoles()[0]?.id,
      setRole: (roleId: string) => setInvite({ ...invite(), roleId }),
      /** The roles an invitation may give. */
      roles: inviteRoles,
      save: () => {
        const recipient = invite().recipient.trim();
        const roleId = invite().roleId ?? inviteRoles()[0]?.id;
        if (recipient === "" || roleId === undefined) return;
        if (intent?.recipientId !== recipient || intent.roleId !== roleId)
          intent = invitationIntent(recipient, roleId);
        send(intent, recipient);
      },
    },
    revoke: (invitationId: string) =>
      send(
        { kind: "revoke", invitationId },
        invitations().find((invitation) => invitation.id === invitationId)?.recipient,
      ),
  };
}

export type WorkspaceSettingsView = ReturnType<typeof useWorkspaceSettings>;
