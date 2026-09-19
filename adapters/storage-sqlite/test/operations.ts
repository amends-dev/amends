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
export const createWorkspace = (creator: Identity.HumanId) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.createWorkspace(creator, { name: "Test workspace" }),
  );

export const getMember = (
  workspaceId: Workspace.Id,
  identity: Identity.Reference,
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
  identity: Identity.Reference,
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
  identity: Identity.Reference,
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
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.inWorkspace(
      workspaceId,
      Effect.flatMap(InvitationApplication.Service, (invitations) =>
        invitations.accept(invitationId, recipient),
      ),
    ),
  );

export const revokeInvitation = (
  workspaceId: Workspace.Id,
  identity: Identity.Reference,
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

export * as Operations from "./operations.ts";

export const ownership = (workspaceId: Workspace.Id, identity: Identity.Reference) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(OwnershipApplication.Service, (service) => service.get),
    ),
  );
export const transferOwnership = (
  workspaceId: Workspace.Id,
  identity: Identity.Reference,
  input: Ownership.TransferInput,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(OwnershipApplication.Service, (service) => service.transfer(input)),
    ),
  );

export const access = (
  workspaceId: Workspace.Id,
  identity: Identity.Reference,
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
  identity: Identity.Reference,
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
  identity: Identity.Reference,
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
  identity: Identity.Reference,
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
