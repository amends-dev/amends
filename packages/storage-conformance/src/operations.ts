import { Identity } from "@amends/core/identity";
import { Assignment, AssignmentApplication } from "@amends/core/authorization";
import {
  Invitation,
  InvitationApplication,
  Member,
  MemberApplication,
  Ownership,
  OwnershipApplication,
  Workspace,
} from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";

/**
 * Test driver over the gateway: each function enters a workspace and runs one
 * core application operation for an asserted identity, the way a protocol
 * handler does, without going through HTTP.
 */
export const createWorkspace = (creator: Identity.HumanId, memberName?: Member.Name) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.createWorkspace(creator, {
      name: "Test workspace",
      ...(memberName === undefined ? {} : { memberName }),
    }),
  );
export const renameMember = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  name: Member.Name,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(MemberApplication.Service, (members) => members.rename(name)),
    ),
  );

export const getMember = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  memberId: Member.Id,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(MemberApplication.Service, (members) => members.get(memberId)),
    ),
  );

export const removeMember = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  memberId: Member.Id,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(MemberApplication.Service, (members) => members.remove(memberId)),
    ),
  );

export const invite = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  request: Invitation.IssueInput,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(InvitationApplication.Service, (invitations) => invitations.issue(request)),
    ),
  );

export const acceptInvitation = (
  workspaceId: Workspace.Id,
  recipient: Identity.HumanId,
  invitationId: Invitation.Id,
  name?: Member.Name,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.inWorkspace(
      workspaceId,
      Effect.flatMap(InvitationApplication.Service, (invitations) =>
        invitations.accept(invitationId, recipient, name === undefined ? {} : { name }),
      ),
    ),
  );

export const revokeInvitation = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  invitationId: Invitation.Id,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(InvitationApplication.Service, (invitations) =>
        invitations.revoke(invitationId),
      ),
    ),
  );

export const ownership = (workspaceId: Workspace.Id, identity: Identity.MemberReference) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(OwnershipApplication.Service, (service) => service.get),
    ),
  );
export const transferOwnership = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  input: Ownership.TransferInput,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(OwnershipApplication.Service, (service) => service.transfer(input)),
    ),
  );

export const permissions = (workspaceId: Workspace.Id, identity: Identity.MemberReference) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(AssignmentApplication.Service, (service) => service.permissions),
    ),
  );
export const access = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  memberId: Member.Id,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(AssignmentApplication.Service, (service) => service.list(memberId)),
    ),
  );
export const assign = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  input: Assignment.AssignInput,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(AssignmentApplication.Service, (service) => service.assign(input)),
    ),
  );
export const change = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  input: Assignment.ChangeInput,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(AssignmentApplication.Service, (service) => service.change(input)),
    ),
  );
export const revokeAssignment = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  memberId: Member.Id,
  assignmentId: Assignment.Id,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(AssignmentApplication.Service, (service) =>
        service.revoke(memberId, assignmentId),
      ),
    ),
  );

export * as Operations from "./operations.ts";
