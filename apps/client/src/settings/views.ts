import type {
  InvitationStatus,
  MemberDetail,
  MemberFilter,
  SettingsAction,
  SettingsFailure,
  SettingsInvitation,
  SettingsPerson,
  SettingsRole,
  SettingsTab,
} from "@amends-dev/ui/screens/settings";
import { useAtomValue } from "@effect/atom-solid";
import { Cause, DateTime, Effect, Option, Predicate } from "effect";
import { AsyncResult } from "effect/reactivity";
import { createEffect, createMemo, createSignal, on } from "solid-js";
import { useChanges } from "../api/changes.ts";
import type { Member } from "../conversations/api.ts";
import { workspaceFailure } from "../api/failures.ts";
import {
  changeSettings,
  invitationIntent,
  reloadSettings,
  settingsReads,
  type SettingsCommand,
  type SettingsData,
  type SettingsReads,
  Assignment,
  Scope,
  Invitation,
  Identity,
} from "./api.ts";
import { memberName, usePeople } from "../conversations/views.ts";
import { toDate } from "../conversations/time.ts";
import { useApiClient, useWorkspaceClient } from "../provider.tsx";
import { useWorkspace } from "../session/directory.tsx";

/** A change that completed and whose result is shown. */
export interface SettingsDone {
  readonly action: SettingsAction;
  /** Whom it concerned by name: the member, the new owner, or the invitation's recipient. */
  readonly subject?: string;
  /** The invitation it created. */
  readonly created?: string;
}

/** A member as settings shows them, with what the reader may change about them. */
interface Row {
  readonly detail: MemberDetail;
  /** Their workspace role's id, when the reader may read their access and they hold one. */
  readonly roleId: string | undefined;
  /** The roles the reader may give them; empty when the reader may not change their role. */
  readonly roles: readonly SettingsRole[];
  /** The reader may remove them now. */
  readonly removable: boolean;
}

type Entry = SettingsData["members"][number];
const workspaceRoles = (entry: Entry) =>
  entry.access?.assignments.filter(
    (assignment) =>
      assignment.status === "active" &&
      Assignment.Source.isAnyOf(["Role"])(assignment.source) &&
      Scope.Scope.isAnyOf(["Workspace"])(assignment.source.scope),
  ) ?? [];
const statusOf = (
  invitation: SettingsData["invitations"][number],
  now: number,
): InvitationStatus => {
  if (Invitation.State.isAnyOf(["Accepted"])(invitation.state)) return "accepted";
  if (Invitation.State.isAnyOf(["Revoked"])(invitation.state)) return "revoked";
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
  section: SettingsTab,
  options: { readonly done?: (done: SettingsDone) => void } = {},
) {
  const membership = useWorkspace(() => workspaceId);
  const people = usePeople(workspaceId);
  const selfId = () => membership()?.member.id as string | undefined;
  const client = useApiClient();
  const reads = settingsReads(useWorkspaceClient(workspaceId), workspaceId);
  const read = reads ? connect(reads, section) : undefined;
  const data = () => read?.data();
  const changes = useChanges({
    workspaceId,
    write: changeSettings,
    reload: reads ? reloadSettings(client, reads, section) : Effect.void,
    done: (change: SettingsCommand, created, subject: string | undefined) => {
      if (change.kind === "rename") setName(undefined);
      if (change.kind === "role") setRole(undefined);
      if (change.kind === "transfer") setTransfer(undefined);
      if (change.kind === "invite") {
        intent = undefined;
        setInvite({ recipient: "", roleId: undefined });
      }
      options.done?.({ action: change.kind, subject, created });
    },
    outdated: () => data() !== undefined && read?.failure() !== undefined,
  });
  const send = changes.send;

  /** Each person's address by human ID, for a reader who manages invitations. */
  const addresses = createMemo(
    () => new Map((data()?.accounts ?? []).map((account) => [account.id as string, account.email])),
  );
  const person = (member: Member.Member): SettingsPerson => ({
    id: member.id,
    name: memberName(member),
    agent: Identity.MemberReference.isAnyOf(["Agent"])(member.identity),
    you: member.id === selfId(),
  });
  const rowOf = (entry: Entry): Row => {
    const access = entry.access;
    // A closed membership holds no access, whatever its assignments still record.
    const current = entry.member.status === "active" ? access : null;
    const assigned = workspaceRoles(entry)[0];
    const roleId = Predicate.isTagged(assigned?.source, "Role")
      ? assigned.source.roleId
      : undefined;
    const roleName =
      roleId === undefined
        ? undefined
        : (access?.roles.find((choice) => choice.role.id === roleId)?.role.name ?? roleId);
    const assignable =
      access?.roles
        .filter((choice) => choice.assignable)
        .map((choice) => ({ id: choice.role.id, name: choice.role.name })) ?? [];
    // A role the reader may not give, such as Owner, changes only by transferring ownership.
    const editable =
      access?.canManage === true &&
      entry.member.status === "active" &&
      (roleId === undefined || assignable.some((choice) => choice.id === roleId));
    return {
      detail: {
        ...person(entry.member),
        signIn: addresses().get(entry.member.identity.id),
        status: entry.member.status,
        role: roleName,
        access: current?.assignments.map(({ id, source, status }) => {
          const scope = Assignment.Source.isAnyOf(["Role"])(source)
            ? source.scope
            : source.grant.scope;
          return {
            id,
            name: Assignment.Source.isAnyOf(["Role"])(source)
              ? (current.roles.find((choice) => choice.role.id === source.roleId)?.role.name ??
                source.roleId)
              : source.grant.permission,
            scope: Scope.Scope.isAnyOf(["Workspace"])(scope)
              ? ("workspace" as const)
              : ("target" as const),
            active: status === "active",
          };
        }),
      },
      roleId,
      roles: editable ? assignable : [],
      removable: entry.canRemove && entry.member.status === "active",
    };
  };
  const byName = (left: SettingsPerson, right: SettingsPerson) =>
    left.name.localeCompare(right.name);
  // The reader first, then everyone by name.
  const roster = createMemo(() =>
    (data()?.members ?? [])
      .map(rowOf)
      .toSorted(
        (left, right) =>
          Number(right.detail.you) - Number(left.detail.you) || byName(left.detail, right.detail),
      ),
  );
  const rowOfMember = (memberId: string) => roster().find((row) => row.detail.id === memberId);
  const [query, setQuery] = createSignal("");
  const [filter, setFilter] = createSignal<MemberFilter>("active");
  const members = createMemo(() => {
    const words = query().trim().toLowerCase();
    return roster()
      .map((row) => row.detail)
      .filter(
        (member) =>
          member.status === filter() &&
          (words === "" ||
            member.name.toLowerCase().includes(words) ||
            member.signIn?.includes(words) === true),
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
          recipient: addresses().get(invitation.details.recipientId) ?? "Unknown address",
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
      changes.revision,
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
      if (!read) return "unavailable";
      const failure = read.failure();
      if (failure === undefined) return "loading";
      const error = workspaceFailure(failure);
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
      roster().filter((row) => row.detail.status === "active").length,
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
    member: (memberId: string) => rowOfMember(memberId)?.detail,
    /** The reader may remove the member now. */
    removable: (memberId: string) => rowOfMember(memberId)?.removable ?? false,
    query,
    setQuery,
    filter,
    setFilter,
    /** Every invitation the reader may read, newest first. */
    invitations,
    /** The change running, or `refresh`. */
    pending: () => (data() !== undefined ? changes.pending() : undefined),
    failure: (): SettingsFailure | undefined => {
      const failure = data() !== undefined ? changes.failure() : undefined;
      return failure && { action: failure.action, error: failure.error };
    },
    /** What the reader sees is out of date: changes wait for a refresh. */
    stale: changes.stale,
    /** Reload, on behalf of the change that found the values out of date, if any. */
    refresh: changes.refresh,
    /** Set aside the last change's failure, such as when its dialog closes. */
    dismiss: changes.dismiss,
    rename: {
      name: () => name()?.name ?? storedName(),
      setName: (value: string) =>
        setName({ name: value, expected: name()?.expected ?? storedName() }),
      /** The name differs from the one saved and can be saved now. */
      changed: () => {
        const draft = name()?.name.trim();
        return !changes.stale() && draft !== undefined && draft !== "" && draft !== storedName();
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
        changes.dismiss();
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
      /** The roles the reader may give the member; empty when they may not change their role. */
      choices: (memberId: string) => rowOfMember(memberId)?.roles ?? [],
      /** The member's chosen role, or their current one. */
      of: (memberId: string) => {
        const edit = role();
        return edit?.memberId === memberId ? edit.roleId : rowOfMember(memberId)?.roleId;
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
          !changes.stale() &&
          edit?.memberId === memberId &&
          edit.roleId !== rowOfMember(memberId)?.roleId
        );
      },
      save: (memberId: string) => {
        const edit = role();
        if (edit?.memberId !== memberId) return;
        send(
          { kind: "role", memberId, roleId: edit.roleId, expectedAssignmentIds: edit.expected },
          rowOfMember(memberId)?.detail.name,
        );
      },
      /** Drop the choice, such as when the member's details close. */
      reset: () => setRole(undefined),
    },
    remove: (memberId: string) =>
      send({ kind: "remove", memberId }, rowOfMember(memberId)?.detail.name),
    invite: {
      /** Start a new invitation for the first role the reader may give. */
      begin: () => {
        changes.dismiss();
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
        if (intent?.email !== recipient || intent.roleId !== roleId)
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

const settled = <A, E>(read: AsyncResult.AsyncResult<A, E>): Cause.Cause<E> | undefined =>
  AsyncResult.isFailure(read) && !read.waiting ? read.cause : undefined;
/** A section's reads, live while mounted, and the last complete view of them. */
function connect(reads: SettingsReads, section: SettingsTab) {
  const settings = useAtomValue(() => reads.settings),
    ownership = useAtomValue(() => reads.ownership),
    members = useAtomValue(() => reads.members(section === "members"));
  const canReadInvitations = createMemo(() =>
    Option.match(AsyncResult.value(settings()), {
      onNone: () => false,
      onSome: (view) => view.canReadInvitations,
    }),
  );
  const invitations = useAtomValue(() =>
    reads.invitations(section === "members" && canReadInvitations()),
  );
  const accounts = useAtomValue(() =>
    reads.accounts(section === "members" && canReadInvitations()),
  );
  return {
    // Keep the last complete view while reads refresh, so live updates never blank the page.
    data: createMemo<SettingsData | undefined>((previous) => {
      const view = AsyncResult.value(settings()),
        owner = AsyncResult.value(ownership()),
        people = AsyncResult.value(members()),
        invites = AsyncResult.value(invitations()),
        addresses = AsyncResult.value(accounts());
      if (
        Option.isNone(view) ||
        Option.isNone(owner) ||
        Option.isNone(people) ||
        Option.isNone(invites) ||
        Option.isNone(addresses)
      )
        return previous;
      return {
        settings: view.value,
        ownership: owner.value,
        members: people.value,
        invitations: invites.value,
        accounts: addresses.value,
      };
    }),
    /** Why the latest read failed, once it settles. */
    failure: createMemo(
      () =>
        settled(settings()) ??
        settled(ownership()) ??
        settled(members()) ??
        settled(invitations()) ??
        settled(accounts()),
    ),
  };
}
