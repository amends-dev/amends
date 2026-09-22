import {
  IssueInvitationForm as InvitationForm,
  type InvitationRoles,
  type IssueInvitationResult,
  type InvitationDraft,
} from "@amends/design-system/invitations";
import { BuiltinRoles, Role } from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import type { Workspace } from "@amends/core/workspace";
import { DateTime, Exit } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Show } from "solid-js";
import { Invitations } from "../../api/invitations.ts";
import { useCommand, useQuery } from "../../api/hooks.ts";
import { explain, failureOf, valueOf } from "../../api/errors.ts";
import { useWorkspace } from "../../workspace/context.tsx";
import { Assignments } from "../../api/assignments.ts";

export function IssueInvitationForm() {
  const membership = useWorkspace();
  return (
    <Show when={membership().workspace.id} keyed>
      {(workspaceId) => <ConnectedForm workspaceId={workspaceId} />}
    </Show>
  );
}
function ConnectedForm(props: { workspaceId: Workspace.Id }) {
  const roles = useQuery(() => Assignments.roles(props.workspaceId));
  const issuance = useCommand(Invitations.makeIssue());
  const choices = (): InvitationRoles => {
    const result = roles.result();
    const value = valueOf(result);
    const failure = failureOf(result);
    if (value === undefined)
      return failure
        ? { _tag: "Unavailable", message: explain(failure.cause) }
        : { _tag: "Loading" };
    return {
      _tag: "Ready",
      choices: value
        .filter(({ role }) => role.id !== BuiltinRoles.OwnerId)
        .map(({ role, assignable }) => ({ id: role.id, label: role.name, assignable })),
      refreshing: AsyncResult.isWaiting(result),
      ...(failure ? { refreshError: explain(failure.cause) } : {}),
    };
  };
  const submit = async (draft: InvitationDraft): Promise<IssueInvitationResult> => {
    const exit = await issuance.run({
      workspaceId: props.workspaceId,
      payload: {
        recipientId: Identity.HumanId.make(draft.recipientId),
        roleId: Role.Id.make(draft.roleId),
        expiresAt: DateTime.add(DateTime.nowUnsafe(), { days: draft.expiresInDays }),
      },
    });
    if (exit === undefined) return { _tag: "Cancelled" };
    if (Exit.isFailure(exit)) return { _tag: "Failed", message: explain(exit.cause) };
    return {
      _tag: "Issued",
      recipientId: exit.value.details.recipientId,
      expiresOn: DateTime.formatIsoDate(exit.value.details.expiresAt),
    };
  };
  return (
    <InvitationForm
      roles={choices()}
      defaultRoleId={BuiltinRoles.ViewerId}
      onRetryRoles={roles.refresh}
      onSubmit={submit}
    />
  );
}
