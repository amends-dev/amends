import { For, Show, createUniqueId } from "solid-js";
import { IconMarkForward, IconMarkMail } from "@amends-dev/icons";
import { Avatar } from "../../components/avatar/index.ts";
import { Button } from "../../components/button/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { Field } from "../../components/field/index.ts";
import { SearchField } from "../../components/input/index.ts";
import { Menu } from "../../components/menu/index.ts";
import { Select } from "../../components/select/index.ts";
import { Keyed } from "../../internal/keyed.tsx";
import { dateLabel, daysUntil } from "../../internal/when.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { SectionHeading, type SettingsFailure } from "./workspace-settings.tsx";
import {
  SettingsAlert,
  displayName,
  type SettingsError,
  type SettingsPerson,
  type SettingsRole,
} from "./wording.tsx";
import * as s from "./settings.css.ts";

/** A member in the roster. */
export interface RosterMember extends SettingsPerson {
  readonly status: "active" | "removed";
  /** Their workspace role by name, when the reader may see it. */
  readonly role?: string;
}

export type MemberFilter = "active" | "removed";

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export interface SettingsInvitation {
  readonly id: string;
  /** The sign-in email it was issued to. */
  readonly recipient: string;
  /** The role it gives, by name. */
  readonly role: string;
  readonly status: InvitationStatus;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  /** The reader may revoke it. */
  readonly revocable?: boolean;
}

/** "Member · Expires in 5 days", "Member · Expired Sep 22", or when it was created. */
export function invitationDetail(invitation: SettingsInvitation, now = new Date()) {
  if (invitation.status === "pending") {
    const days = daysUntil(invitation.expiresAt, now);
    return `${invitation.role} · Expires in ${days} ${days === 1 ? "day" : "days"}`;
  }
  if (invitation.status === "expired")
    return `${invitation.role} · Expired ${dateLabel(invitation.expiresAt, now)}`;
  return `${invitation.role} · Created ${dateLabel(invitation.issuedAt, now)}`;
}

export interface MemberSettingsProps {
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly filter: MemberFilter;
  readonly onFilterChange: (filter: MemberFilter) => void;
  /** Members after the search and filter. */
  readonly members: ReadonlyArray<RosterMember>;
  /** The member open in the side panel. */
  readonly selectedId?: string;
  readonly memberHref: (id: string) => string;
  /** Opens a member in place of following their link. */
  readonly onOpenMember?: (id: string) => void;
  /** Pending invitations, newest first; absent when the reader may not see invitations. */
  readonly invitations?: ReadonlyArray<SettingsInvitation>;
  /** An invitation just created, marked in the list. */
  readonly highlightId?: string;
  /** Opens the invitation history. */
  readonly onViewHistory?: () => void;
  /** Asks to revoke a pending invitation. */
  readonly onRevoke?: (id: string) => void;
  /** A read that failed. */
  readonly failure?: SettingsFailure;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

const filters: ReadonlyArray<{ readonly value: MemberFilter; readonly label: string }> = [
  { value: "active", label: "Active members" },
  { value: "removed", label: "Removed members" },
];

/**
 * The Members tab: search and filter above the roster, then pending invitations. Phones list
 * members with their role and show the invitations as one card. Place it in SettingsPane.
 */
export function MemberSettings(props: MemberSettingsProps) {
  const kind = (member: RosterMember) =>
    [
      member.role,
      member.agent ? "Agent" : undefined,
      member.status === "removed" ? "Removed" : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <>
      <Pane.Toolbar>
        <SearchField
          placeholder="Search members…"
          class={s.search}
          value={props.query}
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
        />
        <Pane.ToolbarEnd>
          <Menu.Root placement="bottom-end">
            <Menu.Trigger>
              {filters.find((filter) => filter.value === props.filter)?.label}
            </Menu.Trigger>
            <Menu.Content aria-label="Show members">
              <Menu.RadioGroup
                value={props.filter}
                onChange={(value) => props.onFilterChange(value as MemberFilter)}
              >
                <For each={filters}>
                  {(filter) => <Menu.RadioItem value={filter.value}>{filter.label}</Menu.RadioItem>}
                </For>
              </Menu.RadioGroup>
            </Menu.Content>
          </Menu.Root>
        </Pane.ToolbarEnd>
      </Pane.Toolbar>
      <div class={s.headings} aria-hidden="true">
        <span class={s.headingMember}>Member</span>
        <span>Workspace role</span>
        <span>Status</span>
        <Divider class={s.headingsStitch} />
      </div>
      <Pane.Body inset="list">
        <div class={s.members}>
          <Show when={props.failure}>
            {(failure) => (
              <SettingsAlert
                action={failure().action}
                error={failure().error}
                onRefresh={props.onRefresh}
                refreshing={props.refreshing}
              />
            )}
          </Show>
          <Show
            when={props.members.length > 0}
            fallback={
              <p class={s.empty}>
                {props.query.trim()
                  ? `No ${props.filter === "removed" ? "removed " : ""}members match “${props.query.trim()}”.`
                  : props.filter === "removed"
                    ? "Nobody has been removed from this workspace."
                    : "No members yet."}
              </p>
            }
          >
            <ul
              class={s.list}
              aria-label={props.filter === "removed" ? "Removed members" : "Members"}
            >
              <Keyed each={props.members} by={(member) => member.id}>
                {(member) => (
                  <li>
                    <a
                      href={props.memberHref(member().id)}
                      class={s.row}
                      aria-current={props.selectedId === member().id ? "true" : undefined}
                      onClick={(event) => {
                        if (!props.onOpenMember) return;
                        event.preventDefault();
                        props.onOpenMember(member().id);
                      }}
                    >
                      <Avatar
                        name={member().name}
                        initials={member().initials}
                        tone={member().tone}
                        size={32}
                        decorative
                      />
                      <span class={s.rowText}>
                        <span class={s.rowName}>{displayName(member())}</span>
                        <Show when={member().agent}>
                          <span class={`${s.rowKind} ${s.desktopOnly}`}>Agent</span>
                        </Show>
                        <Show when={kind(member())}>
                          <span class={s.rowRole}>{kind(member())}</span>
                        </Show>
                      </span>
                      <span class={s.role}>{member().role ?? ""}</span>
                      <span class={s.status}>
                        {member().status === "active" ? "Active" : "Removed"}
                      </span>
                      <IconMarkForward class={s.open} />
                    </a>
                  </li>
                )}
              </Keyed>
            </ul>
          </Show>
          <Show when={props.invitations}>
            {(invitations) => (
              <>
                <section class={s.invitations} aria-label="Pending invitations">
                  <SectionHeading
                    count={invitations().length}
                    action={
                      props.onViewHistory
                        ? { label: "View history", onClick: () => props.onViewHistory?.() }
                        : undefined
                    }
                  >
                    Pending invitations
                  </SectionHeading>
                  <Show
                    when={invitations().length > 0}
                    fallback={<p class={s.empty}>No invitations are waiting.</p>}
                  >
                    <ul class={s.list} aria-label="Pending invitations">
                      <Keyed each={invitations()} by={(invitation) => invitation.id}>
                        {(invitation) => (
                          <li
                            class={s.invitation}
                            data-highlight={props.highlightId === invitation().id ? "" : undefined}
                          >
                            <span class={s.tile} aria-hidden="true">
                              <IconMarkMail class={s.tileIcon} />
                            </span>
                            <span class={s.invitationText}>
                              <span class={s.rowName}>{invitation().recipient}</span>
                              <span class={s.invitationDetail}>
                                {invitationDetail(invitation())}
                              </span>
                            </span>
                            <Show when={invitation().revocable && props.onRevoke}>
                              {(revoke) => (
                                <Button
                                  variant="quiet"
                                  aria-label={`Revoke invitation for ${invitation().recipient}`}
                                  onClick={() => revoke()(invitation().id)}
                                >
                                  Revoke
                                </Button>
                              )}
                            </Show>
                          </li>
                        )}
                      </Keyed>
                    </ul>
                  </Show>
                </section>
                <section class={s.invitationsCard} aria-label="Invitations">
                  <SectionHeading count={invitations().length}>Invitations</SectionHeading>
                  <button type="button" class={s.card} onClick={() => props.onViewHistory?.()}>
                    <IconMarkMail class={s.cardIcon} />
                    <span class={s.cardText}>
                      <span class={s.rowName}>
                        {invitations().length === 1
                          ? "1 pending invitation"
                          : `${invitations().length} pending invitations`}
                      </span>
                      <span class={s.invitationDetail}>View and manage invitations</span>
                    </span>
                    <IconMarkForward class={s.cardIcon} />
                  </button>
                </section>
              </>
            )}
          </Show>
        </div>
      </Pane.Body>
    </>
  );
}

/** A member as their details show them. */
export interface MemberDetail extends RosterMember {
  /** The address they sign in with, when the reader may see it. */
  readonly signIn?: string;
  /** Their access, when the reader may read it. */
  readonly access?: ReadonlyArray<{
    readonly id: string;
    /** The role's name, or a permission. */
    readonly name: string;
    readonly scope: "workspace" | "target";
    readonly active: boolean;
  }>;
}

export interface MemberDetailsProps {
  readonly workspaceName: string;
  readonly member: MemberDetail;
  readonly onClose: () => void;
  /** Roles the reader may give; empty when they may not change this member's role. */
  readonly roles: ReadonlyArray<SettingsRole>;
  /** The chosen role's id. */
  readonly role?: string;
  readonly onRoleChange: (roleId: string) => void;
  /** The chosen role differs from their current one. */
  readonly roleChanged: boolean;
  readonly onSaveRole: () => void;
  readonly saving?: boolean;
  /** Asks to remove the member; shown when the reader may. */
  readonly onRemove?: () => void;
  /** A failed role change. */
  readonly error?: SettingsError;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/**
 * A member in the side panel: who they are, their workspace role, their access, and removing
 * them. On phones it fills the screen, with its actions along the bottom.
 */
export function MemberDetails(props: MemberDetailsProps) {
  const formId = `member-role-${createUniqueId()}`;
  const editable = () => props.roles.length > 0;
  const summary = () =>
    `${props.member.agent ? "Agent" : "Person"} · ${props.member.status === "active" ? "Active" : "Removed"}`;
  return (
    <Shell.Aside aria-label="Member details" onClose={() => props.onClose()}>
      <Pane.Root variant="side">
        <Pane.Header>
          <Pane.Back onClick={() => props.onClose()}>Members</Pane.Back>
          <Pane.Title>Member details</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close member details" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Pane.Subtitle>{props.workspaceName}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <div class={s.member}>
            <div class={s.identity}>
              <div class={s.person}>
                <Avatar
                  name={props.member.name}
                  initials={props.member.initials}
                  tone={props.member.tone}
                  size={48}
                  decorative
                />
                <div class={s.personText}>
                  <h3 class={s.identityName}>{displayName(props.member)}</h3>
                  <Show when={props.member.signIn}>
                    {(address) => <span class={s.identityDetail}>{address()}</span>}
                  </Show>
                </div>
              </div>
              <p class={s.note}>{summary()}</p>
            </div>
            <Show when={editable()}>
              <form
                id={formId}
                class={s.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (props.roleChanged && !props.saving) props.onSaveRole();
                }}
              >
                <Field.Root hint="Changing the workspace role keeps any separate permissions in place.">
                  <Field.Label>Workspace role</Field.Label>
                  <Select
                    options={props.roles.map((role) => ({ value: role.id, label: role.name }))}
                    value={props.role}
                    onChange={props.onRoleChange}
                    placeholder="Choose a role"
                    disabled={props.saving}
                  />
                </Field.Root>
              </form>
            </Show>
            <Show when={props.error}>
              {(error) => (
                <SettingsAlert
                  action="role"
                  error={error()}
                  onRefresh={props.onRefresh}
                  refreshing={props.refreshing}
                />
              )}
            </Show>
            <Show when={props.member.access}>
              {(access) => (
                <section class={s.section} aria-label="Access">
                  <SectionHeading>Access</SectionHeading>
                  <Show
                    when={access().length > 0}
                    fallback={<p class={s.note}>No access is assigned.</p>}
                  >
                    <ul class={s.access}>
                      <For each={access()}>
                        {(entry) => (
                          <li>
                            <span class={s.accessName}>{entry.name}</span>
                            <span class={s.accessDetail}>
                              {entry.scope === "workspace" ? "Workspace" : "One item"} ·{" "}
                              {entry.active ? "Active" : "Revoked"}
                            </span>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </section>
              )}
            </Show>
            <section class={s.section} aria-label="Membership">
              <SectionHeading>Membership</SectionHeading>
              <Show
                when={props.member.status === "active"}
                fallback={
                  <p class={s.note}>This membership has ended. Invite them again to rejoin.</p>
                }
              >
                <Show when={props.onRemove}>
                  {(remove) => (
                    <Button class={s.start} disabled={props.saving} onClick={() => remove()()}>
                      Remove member
                    </Button>
                  )}
                </Show>
                <p class={s.note}>Rejoining after removal requires a new invitation.</p>
              </Show>
            </section>
          </div>
        </Pane.Body>
        <Show when={editable()}>
          <Modal.Actions>
            <Button onClick={() => props.onClose()}>Cancel</Button>
            <Button
              type="submit"
              form={formId}
              variant="primary"
              disabled={!props.roleChanged || props.saving}
            >
              Save role
            </Button>
          </Modal.Actions>
        </Show>
      </Pane.Root>
    </Shell.Aside>
  );
}

export interface ConfirmRemoveMemberProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workspaceName: string;
  readonly name: string;
  readonly onConfirm: () => void;
  readonly pending?: boolean;
  readonly error?: SettingsError;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** Confirms removing a member from the workspace. */
export function ConfirmRemoveMember(props: ConfirmRemoveMemberProps) {
  const close = () => {
    if (!props.pending) props.onClose();
  };
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Remove member" size="compact">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>{`Remove ${props.name}?`}</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>They will lose access to {props.workspaceName}.</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <div class={s.stack}>
            <p class={s.confirm}>
              To rejoin, they’ll need a fresh invitation. Their previous membership will remain in
              the removed-member history.
            </p>
            <Show when={props.error}>
              {(error) => (
                <SettingsAlert
                  action="remove"
                  error={error()}
                  onRefresh={props.onRefresh}
                  refreshing={props.refreshing}
                />
              )}
            </Show>
          </div>
        </Pane.Body>
        <Modal.Actions>
          <Button onClick={close} disabled={props.pending}>
            Cancel
          </Button>
          <Button variant="primary" disabled={props.pending} onClick={() => props.onConfirm()}>
            Remove member
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}
