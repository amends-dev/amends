import { Identity } from "@amends/core/identity";
import {
  Invitation,
  InvitationApplication,
  Member,
  MemberApplication,
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
  Effect.flatMap(Gateway.Service, (gateway) => gateway.createWorkspace(creator));

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
  request: Invitation.Request,
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

export const enableInvitations = (workspaceId: Workspace.Id, identity: Identity.Reference) =>
  Effect.flatMap(Gateway.Service, (gateway) => gateway.enableInvitations(workspaceId, identity));

export * as Operations from "./operations.ts";
