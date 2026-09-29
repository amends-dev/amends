import {
  paths,
  useWorkspace,
  useWorkspaceSettings,
  type SettingsAction,
  type SettingsSection,
} from "@amends/client";
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
} from "@amends/ui/screens/settings";
import { Navigate, useParams, useSearchParams } from "@solidjs/router";
import { Show, createSignal } from "solid-js";
import { useWorkspaceActions } from "../workspace-actions.ts";

const href = (path: string) => `#${path}`;

export function SettingsIndex() {
  const params = useParams<{ workspaceId: string }>();
  return <Navigate href={paths.settingsSection(params.workspaceId, "workspace")} />;
}
export function WorkspaceSettingsPage() {
  const params = useParams<{ workspaceId: string }>();
  return (
    <Show when={params.workspaceId} keyed>
      {(workspaceId) => <Settings workspaceId={workspaceId} tab="workspace" />}
    </Show>
  );
}
export function MembersSettingsPage() {
  const params = useParams<{ workspaceId: string }>();
  return (
    <Show when={params.workspaceId} keyed>
      {(workspaceId) => <Settings workspaceId={workspaceId} tab="members" />}
    </Show>
  );
}

type Dialog = "invite" | "history" | "transfer" | "remove" | "revoke";

/** A workspace's settings: one section, with the member open beside Members by `?member=`. */
function Settings(props: { readonly workspaceId: string; readonly tab: SettingsSection }) {
  const { workspaceId } = props;
  const [search, setSearch] = useSearchParams<{ member?: string }>();
  const workspace = useWorkspace(() => workspaceId);
  const actions = useWorkspaceActions();
  const [dialog, setDialog] = createSignal<Dialog>();
  // Revoking from the history returns to it.
  const [fromHistory, setFromHistory] = createSignal(false);
  const [revoking, setRevoking] = createSignal<string>();
  const [created, setCreated] = createSignal<string>();
  const view = useWorkspaceSettings(workspaceId, props.tab, {
    done: (done) => {
      actions.toast(settingsToast(done.action, done.subject));
      // The invitation just created stays marked until the next change.
      setCreated(done.action === "invite" ? done.created : undefined);
      if (done.action === "remove") setSearch({ member: undefined });
      setDialog(done.action === "revoke" && fromHistory() ? "history" : undefined);
    },
  });
  const open = (next: Dialog) => {
    view.dismiss();
    setDialog(next);
  };
  const close = () => {
    view.dismiss();
    setDialog(fromHistory() && dialog() === "revoke" ? "history" : undefined);
  };
  const failureOf = (action: SettingsAction) => {
    const failure = view.failure();
    return failure?.action === action ? failure.error : undefined;
  };
  const readFailure = () => {
    const failure = view.failure();
    return failure?.action === "refresh" ? failure : undefined;
  };
  const pending = (action: SettingsAction) => view.pending() === action;
  const refreshing = () => view.pending() === "refresh";
  const name = () => workspace()?.workspace.name ?? view.workspace()?.name ?? "";
  const members = paths.settingsSection(workspaceId, "members");
  const selected = () => (props.tab === "members" ? search.member : undefined);
  const detail = () => {
    const id = selected();
    return id === undefined ? undefined : view.member(id);
  };
  const revoke = (id: string) => {
    setFromHistory(dialog() === "history");
    setRevoking(id);
    open("revoke");
  };
  const invite = () => {
    view.invite.begin();
    setFromHistory(false);
    setDialog("invite");
  };
  return (
    <>
      <SettingsPane
        workspaceName={name()}
        tab={props.tab}
        onInvite={view.permissions().invite ? invite : undefined}
        status={view.status()}
        onRetry={view.refresh}
      >
        <Show
          when={props.tab === "members"}
          fallback={
            <WorkspaceSettings
              workspaceId={workspaceId}
              name={view.rename.name()}
              onNameChange={view.rename.setName}
              renamable={view.permissions().rename}
              changed={view.rename.changed()}
              saving={pending("rename")}
              onSave={view.rename.save}
              owner={view.owner()}
              onTransfer={
                view.permissions().transfer
                  ? () => {
                      view.transfer.begin();
                      setDialog("transfer");
                    }
                  : undefined
              }
              noCandidates={view.candidates().length === 0}
              creator={view.workspace()?.creator}
              failure={
                failureOf("rename")
                  ? { action: "rename", error: failureOf("rename")! }
                  : readFailure()
              }
              onRefresh={view.refresh}
              refreshing={refreshing()}
            />
          }
        >
          <MemberSettings
            query={view.query()}
            onQueryChange={view.setQuery}
            filter={view.filter()}
            onFilterChange={view.setFilter}
            members={view.members().map((member) => ({ ...member, role: member.role?.name }))}
            selectedId={selected()}
            memberHref={(id) => href(`${members}?member=${encodeURIComponent(id)}`)}
            invitations={
              view.permissions().invitations
                ? view.invitations().filter((invitation) => invitation.status === "pending")
                : undefined
            }
            highlightId={created()}
            onViewHistory={() => {
              setFromHistory(false);
              open("history");
            }}
            onRevoke={revoke}
            failure={readFailure()}
            onRefresh={view.refresh}
            refreshing={refreshing()}
          />
        </Show>
      </SettingsPane>
      <Show when={detail()}>
        {(member) => (
          <MemberDetails
            workspaceName={name()}
            member={{ ...member(), role: member().role?.name }}
            onClose={() => {
              view.role.reset();
              view.dismiss();
              setSearch({ member: undefined });
            }}
            roles={member().roles}
            role={view.role.of(member().id)}
            onRoleChange={(roleId) => view.role.choose(member().id, roleId)}
            roleChanged={view.role.changed(member().id)}
            onSaveRole={() => view.role.save(member().id)}
            saving={pending("role")}
            onRemove={
              member().removable && member().status === "active" ? () => open("remove") : undefined
            }
            error={failureOf("role")}
            onRefresh={view.refresh}
            refreshing={refreshing()}
          />
        )}
      </Show>
      <TransferOwnership
        open={dialog() === "transfer"}
        onClose={close}
        workspaceName={name()}
        candidates={view.candidates()}
        chosen={view.transfer.chosen()}
        onChoose={view.transfer.choose}
        onConfirm={view.transfer.save}
        pending={pending("transfer")}
        error={failureOf("transfer")}
        onRefresh={view.refresh}
        refreshing={refreshing()}
      />
      <ConfirmRemoveMember
        open={dialog() === "remove"}
        onClose={close}
        workspaceName={name()}
        name={detail()?.name ?? ""}
        onConfirm={() => {
          const id = selected();
          if (id) view.remove(id);
        }}
        pending={pending("remove")}
        error={failureOf("remove")}
        onRefresh={view.refresh}
        refreshing={refreshing()}
      />
      <InviteMember
        open={dialog() === "invite"}
        onClose={close}
        workspaceName={name()}
        recipient={view.invite.recipient()}
        onRecipientChange={view.invite.setRecipient}
        roles={view.invite.roles()}
        role={view.invite.role()}
        onRoleChange={view.invite.setRole}
        onCreate={view.invite.save}
        pending={pending("invite")}
        error={failureOf("invite")}
        onRefresh={view.refresh}
        refreshing={refreshing()}
      />
      <InvitationHistory
        open={dialog() === "history"}
        onClose={close}
        workspaceName={name()}
        invitations={view.invitations()}
        onRevoke={revoke}
        onInvite={view.permissions().invite ? invite : undefined}
      />
      <ConfirmRevokeInvitation
        open={dialog() === "revoke"}
        onClose={close}
        recipient={
          view.invitations().find((invitation) => invitation.id === revoking())?.recipient ?? ""
        }
        onConfirm={() => {
          const id = revoking();
          if (id) view.revoke(id);
        }}
        pending={pending("revoke")}
        error={failureOf("revoke")}
        onRefresh={view.refresh}
        refreshing={refreshing()}
      />
    </>
  );
}
