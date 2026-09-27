// Workshop harness: Workspace settings with the Lunacy sample members and invitations, following
// the mocks' behavior notes over local state. Not exported.
import { For, Show, createMemo, createSignal } from "solid-js";
import { Toast } from "../../components/toast/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { navigation } from "../sample.ts";
import { WorkspaceNavigation } from "../workspace-navigation/index.ts";
import {
  ConfirmRemoveMember,
  ConfirmRevokeInvitation,
  InvitationHistory,
  InviteMember,
  MemberDetails,
  MemberSettings,
  SettingsPane,
  TransferOwnership,
  WorkspaceSettings,
  settingsToast,
  type MemberDetail,
  type MemberFilter,
  type SettingsAction,
  type SettingsError,
  type SettingsInvitation,
  type SettingsTab,
} from "./index.ts";

const roles = [
  { id: "member", name: "Member" },
  { id: "administrator", name: "Administrator" },
] as const;
const roleName = (id: string) =>
  id === "owner" ? "Owner" : (roles.find((role) => role.id === id)?.name ?? id);

interface SampleMember extends Omit<MemberDetail, "role"> {
  readonly roleId: string;
}

const email = (name: string) => `${name.split(" ")[0]?.toLowerCase()}@mercier.example`;
const member = (
  id: string,
  name: string,
  roleId: string,
  rest: Partial<SampleMember> = {},
): SampleMember => ({
  id,
  name,
  roleId,
  status: "active",
  signIn: rest.agent ? `agent:${id}` : email(name),
  ...rest,
});

export const sampleMembers: readonly SampleMember[] = [
  member("jamie", "Jamie Morgan", "owner", { you: true, initials: "JM", tone: "neutral" }),
  member("alex", "Alex Morgan", "member", { initials: "AM", tone: "sand" }),
  member("sara", "Sara", "administrator", { tone: "clay" }),
  member("graeme", "Graeme", "member", { tone: "slate" }),
  member("oliver", "Oliver", "member", { tone: "olive" }),
  member("caleb", "Caleb", "member", { tone: "sage" }),
  member("yumi", "Yumi", "member", { tone: "lilac", agent: true }),
  member("riley", "Riley Chen", "member", { tone: "slate", status: "removed" }),
];

const now = new Date();
const days = (count: number) => new Date(now.getTime() + count * 86_400_000);
const invitation = (
  recipient: string,
  role: string,
  status: SettingsInvitation["status"],
  issued: number,
): SettingsInvitation => ({
  id: recipient,
  recipient,
  role,
  status,
  issuedAt: days(issued),
  expiresAt: days(issued + 7),
  revocable: status === "pending",
});

export const sampleInvitations: readonly SettingsInvitation[] = [
  invitation("casey@mercier.example", "Member", "pending", -2),
  invitation("taylor@mercier.example", "Administrator", "pending", -1),
  invitation("caleb@mercier.example", "Member", "accepted", -7),
  invitation("morgan@mercier.example", "Member", "expired", -12),
  invitation("riley@mercier.example", "Member", "revoked", -9),
].toSorted((left, right) => right.issuedAt.getTime() - left.issuedAt.getTime());

type Dialog = "invite" | "history" | "transfer" | "remove" | "revoke";

export interface SettingsWorkspaceProps {
  readonly tab?: SettingsTab;
  /** The member open in the side panel. */
  readonly selected?: string;
  readonly dialog?: Dialog;
  readonly status?: "loading" | "failed";
  /** A reader who may only look: no rename, invite, role, removal, or transfer. */
  readonly readOnly?: boolean;
  /** The first attempt at this change finds the values out of date. */
  readonly conflict?: SettingsAction;
}

/** The settings' own rules over local state: drafts, confirmations, and toasts. */
export function SettingsWorkspace(props: SettingsWorkspaceProps) {
  const [tab, setTab] = createSignal<SettingsTab>(props.tab ?? "workspace");
  const [name, setName] = createSignal("Mercier & Co");
  const [draft, setDraft] = createSignal<string>();
  const [members, setMembers] = createSignal(sampleMembers);
  const [invitations, setInvitations] = createSignal(sampleInvitations);
  const [selected, setSelected] = createSignal(props.selected);
  const [roleDraft, setRoleDraft] = createSignal<string>();
  const [query, setQuery] = createSignal("");
  const [filter, setFilter] = createSignal<MemberFilter>("active");
  const [dialog, setDialog] = createSignal<Dialog | undefined>(props.dialog);
  const [revoking, setRevoking] = createSignal<string>(
    props.dialog === "revoke" ? "casey@mercier.example" : "",
  );
  const [newOwner, setNewOwner] = createSignal<string>();
  const [recipient, setRecipient] = createSignal(
    props.dialog === "invite" ? "morgan@mercier.example" : "",
  );
  const [inviteRole, setInviteRole] = createSignal<string>("member");
  const [highlight, setHighlight] = createSignal<string>();
  const [failure, setFailure] = createSignal<{ action: SettingsAction; error: SettingsError }>();
  const [conflict, setConflict] = createSignal(props.conflict);
  const [toasts, setToasts] = createSignal<Array<{ id: number; text: string }>>([]);
  let toastId = 0;
  const toast = (text: string) => setToasts([...toasts(), { id: ++toastId, text }]);
  const can = !props.readOnly;

  /** Runs a change, unless this scenario finds it out of date first. */
  const change = (action: SettingsAction, apply: () => string | undefined) => {
    if (conflict() === action) {
      setConflict(undefined);
      setFailure({ action, error: "changed" });
      return;
    }
    setFailure(undefined);
    toast(settingsToast(action, apply()));
  };
  const errorFor = (action: SettingsAction) =>
    failure()?.action === action ? failure()?.error : undefined;
  const refresh = () => setFailure(undefined);

  const shown = createMemo(() => {
    const words = query().trim().toLowerCase();
    return members().filter(
      (person) =>
        person.status === filter() &&
        (!words ||
          person.name.toLowerCase().includes(words) ||
          person.signIn.toLowerCase().includes(words)),
    );
  });
  const pending = () => invitations().filter((entry) => entry.status === "pending");
  const current = () => members().find((person) => person.id === selected());
  const you = () => members().find((person) => person.you);
  const owner = () => members().find((person) => person.roleId === "owner");
  const candidates = () =>
    members().filter((person) => person.status === "active" && !person.you && !person.agent);
  const closeDialog = () => {
    setFailure(undefined);
    setDialog(undefined);
  };
  // Settings is not a rail destination; the rail marks its own entry instead.
  const { destination: _home, ...nav } = navigation({
    groups: [{ id: "general", name: "general" }],
  });
  return (
    <Shell.Root>
      <WorkspaceNavigation {...nav} settings={{ href: "#settings", current: true }} />
      <Shell.Main>
        <SettingsPane
          workspaceName={name()}
          tab={tab()}
          tabHref={(next) => `#${next}`}
          onTabChange={(next) => {
            setSelected(undefined);
            setTab(next);
          }}
          memberCount={members().filter((person) => person.status === "active").length}
          onInvite={
            can
              ? () => {
                  setRecipient("");
                  setDialog("invite");
                }
              : undefined
          }
          status={props.status}
          onRetry={() => {}}
        >
          <Show
            when={tab() === "members"}
            fallback={
              <WorkspaceSettings
                workspaceId="6f942c11-8a0d-4c55-9e1b-2d7f3a905b62"
                name={draft() ?? name()}
                onNameChange={setDraft}
                renamable={can}
                changed={draft() !== undefined && draft()?.trim() !== "" && draft() !== name()}
                onSave={() =>
                  change("rename", () => {
                    setName(draft()?.trim() ?? name());
                    setDraft(undefined);
                    return undefined;
                  })
                }
                owner={owner()}
                onTransfer={
                  can && owner()?.you
                    ? () => {
                        setNewOwner(undefined);
                        setDialog("transfer");
                      }
                    : undefined
                }
                noCandidates={candidates().length === 0}
                creator={members()[0]}
                failure={errorFor("rename") ? { action: "rename", error: "changed" } : undefined}
                onRefresh={refresh}
              />
            }
          >
            <MemberSettings
              query={query()}
              onQueryChange={setQuery}
              filter={filter()}
              onFilterChange={setFilter}
              members={shown().map((person) => ({ ...person, role: roleName(person.roleId) }))}
              selectedId={selected()}
              memberHref={(id) => `#member-${id}`}
              onOpenMember={(id) => {
                setRoleDraft(undefined);
                setFailure(undefined);
                setSelected(id);
              }}
              invitations={pending()}
              highlightId={highlight()}
              onViewHistory={() => setDialog("history")}
              onRevoke={
                can
                  ? (id) => {
                      setRevoking(id);
                      setDialog("revoke");
                    }
                  : undefined
              }
            />
          </Show>
        </SettingsPane>
        <Show when={tab() === "members" && current()}>
          {(person) => (
            <MemberDetails
              workspaceName={name()}
              member={{
                ...person(),
                role: roleName(person().roleId),
                access: [
                  {
                    id: `${person().id}-role`,
                    name: roleName(person().roleId),
                    scope: "workspace",
                    active: true,
                  },
                ],
              }}
              onClose={() => setSelected(undefined)}
              roles={
                can && person().roleId !== "owner" && person().status === "active" ? roles : []
              }
              role={roleDraft() ?? person().roleId}
              onRoleChange={setRoleDraft}
              roleChanged={roleDraft() !== undefined && roleDraft() !== person().roleId}
              onSaveRole={() =>
                change("role", () => {
                  const roleId = roleDraft();
                  setMembers(
                    members().map((other) =>
                      other.id === person().id && roleId ? { ...other, roleId } : other,
                    ),
                  );
                  setRoleDraft(undefined);
                  return person().name;
                })
              }
              onRemove={
                can && !person().you && person().roleId !== "owner"
                  ? () => setDialog("remove")
                  : undefined
              }
              error={errorFor("role")}
              onRefresh={refresh}
            />
          )}
        </Show>
      </Shell.Main>
      <TransferOwnership
        open={dialog() === "transfer"}
        onClose={closeDialog}
        workspaceName={name()}
        candidates={candidates()}
        chosen={newOwner()}
        onChoose={setNewOwner}
        onConfirm={() =>
          change("transfer", () => {
            const next = members().find((person) => person.id === newOwner());
            setMembers(
              members().map((person) =>
                person.id === next?.id
                  ? { ...person, roleId: "owner" }
                  : person.id === you()?.id
                    ? { ...person, roleId: "administrator" }
                    : person,
              ),
            );
            setDialog(undefined);
            return next?.name;
          })
        }
        error={errorFor("transfer")}
        onRefresh={refresh}
      />
      <Show when={current()}>
        {(person) => (
          <ConfirmRemoveMember
            open={dialog() === "remove"}
            onClose={closeDialog}
            workspaceName={name()}
            name={person().name}
            onConfirm={() =>
              change("remove", () => {
                const { id, name: removed } = person();
                setMembers(
                  members().map((other) =>
                    other.id === id ? { ...other, status: "removed" } : other,
                  ),
                );
                setDialog(undefined);
                setSelected(undefined);
                return removed;
              })
            }
            error={errorFor("remove")}
            onRefresh={refresh}
          />
        )}
      </Show>
      <InviteMember
        open={dialog() === "invite"}
        onClose={closeDialog}
        workspaceName={name()}
        recipient={recipient()}
        onRecipientChange={setRecipient}
        roles={roles}
        role={inviteRole()}
        onRoleChange={setInviteRole}
        onCreate={() =>
          change("invite", () => {
            const created = {
              id: recipient().trim(),
              recipient: recipient().trim(),
              role: roleName(inviteRole()),
              status: "pending" as const,
              issuedAt: new Date(),
              expiresAt: days(7),
              revocable: true,
            };
            setInvitations([created, ...invitations()]);
            setHighlight(created.id);
            setRecipient("");
            setDialog(undefined);
            return created.recipient;
          })
        }
        error={errorFor("invite")}
        onRefresh={refresh}
      />
      <InvitationHistory
        open={dialog() === "history"}
        onClose={closeDialog}
        workspaceName={name()}
        invitations={invitations()}
        onRevoke={
          can
            ? (id) => {
                setRevoking(id);
                setDialog("revoke");
              }
            : undefined
        }
        onInvite={
          can
            ? () => {
                setRecipient("");
                setDialog("invite");
              }
            : undefined
        }
      />
      <ConfirmRevokeInvitation
        open={dialog() === "revoke"}
        onClose={closeDialog}
        recipient={revoking()}
        onConfirm={() =>
          change("revoke", () => {
            setInvitations(
              invitations().map((entry) =>
                entry.id === revoking() ? { ...entry, status: "revoked", revocable: false } : entry,
              ),
            );
            setDialog(undefined);
            return revoking();
          })
        }
        error={errorFor("revoke")}
        onRefresh={refresh}
      />
      <Toast.Region>
        <For each={toasts()}>
          {(item) => (
            <Toast.Item
              onDismiss={() => setToasts(toasts().filter((other) => other.id !== item.id))}
            >
              {item.text}
            </Toast.Item>
          )}
        </For>
      </Toast.Region>
    </Shell.Root>
  );
}
