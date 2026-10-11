import { Identity } from "@amends-dev/core/identity";
import { Assignment, AssignmentService } from "@amends-dev/core/authorization";
import {
  Invitation,
  InvitationService,
  Member,
  MemberService,
  Ownership,
  OwnershipService,
  Workspace,
} from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { Effect } from "effect";

/**
 * Test driver over the gateway: each function enters a workspace and runs one
 * core application operation for an asserted identity, the way a protocol
 * handler does, without going through HTTP. A person joins named as their human
 * ID unless a test names them.
 */
export const createWorkspace = (
  creator: Identity.HumanId,
  memberName: Member.Name = Member.Name.make(creator),
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    gateway.createWorkspace(creator, { name: "Test workspace", memberName }),
  );
export const renameMember = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  name: Member.Name,
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(MemberService.MemberService, (memberService) => memberService.rename(name)),
      ),
    ),
  );

export const getMember = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  memberId: Member.Id,
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(MemberService.MemberService, (memberService) => memberService.get(memberId)),
      ),
    ),
  );

export const removeMember = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  memberId: Member.Id,
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(MemberService.MemberService, (memberService) =>
          memberService.remove(memberId),
        ),
      ),
    ),
  );

export const invite = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  request: Invitation.IssueInput,
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(InvitationService.InvitationService, (invitationService) =>
          invitationService.issue(request),
        ),
      ),
    ),
  );

export const acceptInvitation = (
  workspaceId: Workspace.Id,
  recipient: Identity.HumanId,
  invitationId: Invitation.Id,
  name: Member.Name = Member.Name.make(recipient),
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.inWorkspace(
        workspaceId,
        Effect.flatMap(InvitationService.InvitationService, (invitationService) =>
          invitationService.accept(invitationId, recipient, name),
        ),
      ),
    ),
  );

export const revokeInvitation = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  invitationId: Invitation.Id,
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(InvitationService.InvitationService, (invitationService) =>
          invitationService.revoke(invitationId),
        ),
      ),
    ),
  );

export const ownership = (workspaceId: Workspace.Id, identity: Identity.MemberReference) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(
          OwnershipService.OwnershipService,
          (ownershipService) => ownershipService.get,
        ),
      ),
    ),
  );
export const transferOwnership = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  input: Ownership.TransferInput,
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(OwnershipService.OwnershipService, (ownershipService) =>
          ownershipService.transfer(input),
        ),
      ),
    ),
  );

export const permissions = (workspaceId: Workspace.Id, identity: Identity.MemberReference) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(
          AssignmentService.AssignmentService,
          (assignmentService) => assignmentService.permissions,
        ),
      ),
    ),
  );
export const access = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  memberId: Member.Id,
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) =>
          assignmentService.list(memberId),
        ),
      ),
    ),
  );
export const assign = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  input: Assignment.AssignInput,
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) =>
          assignmentService.assign(input),
        ),
      ),
    ),
  );
export const change = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  input: Assignment.ChangeInput,
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) =>
          assignmentService.change(input),
        ),
      ),
    ),
  );
export const revokeAssignment = (
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  memberId: Member.Id,
  assignmentId: Assignment.Id,
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) =>
          assignmentService.revoke(memberId, assignmentId),
        ),
      ),
    ),
  );
