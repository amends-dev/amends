import { type Assignment, AssignmentService } from "@amends-dev/core/authorization"
import type { Identity } from "@amends-dev/core/identity"
import {
  type Invitation,
  InvitationService,
  Member,
  MemberService,
  type Ownership,
  OwnershipService,
  type WorkspaceId,
  type MemberId
} from "@amends-dev/core/workspace"
import { Gateway } from "@amends-dev/gateway"
import { Effect } from "effect"

/**
 * Test driver over the gateway: each function enters a workspace and runs one
 * core application operation for an asserted identity, the way a protocol
 * handler does, without going through HTTP. A person joins named as their human
 * ID unless a test names them.
 */
export const createWorkspace = (creator: Identity.HumanId, memberName: Member.Name = Member.Name.make(creator)) =>
  Effect.flatMap(Gateway.Gateway, (gateway) => gateway.createWorkspace(creator, { name: "Test workspace", memberName }))
export const renameMember = (
  workspaceId: WorkspaceId.WorkspaceId,
  identity: Identity.MemberReference,
  name: Member.Name
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(MemberService.MemberService, (memberService) => memberService.rename(name))
      )
    )
  )

export const getMember = (
  workspaceId: WorkspaceId.WorkspaceId,
  identity: Identity.MemberReference,
  memberId: MemberId.MemberId
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(MemberService.MemberService, (memberService) => memberService.get(memberId))
      )
    )
  )

export const removeMember = (
  workspaceId: WorkspaceId.WorkspaceId,
  identity: Identity.MemberReference,
  memberId: MemberId.MemberId
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(MemberService.MemberService, (memberService) => memberService.remove(memberId))
      )
    )
  )

export const invite = (
  workspaceId: WorkspaceId.WorkspaceId,
  identity: Identity.MemberReference,
  request: Invitation.IssueInput
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(InvitationService.InvitationService, (invitationService) => invitationService.issue(request))
      )
    )
  )

export const acceptInvitation = (
  workspaceId: WorkspaceId.WorkspaceId,
  recipient: Identity.HumanId,
  invitationId: Invitation.InvitationId,
  name: Member.Name = Member.Name.make(recipient)
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.inWorkspace(
        workspaceId,
        Effect.flatMap(InvitationService.InvitationService, (invitationService) =>
          invitationService.accept(invitationId, recipient, name)
        )
      )
    )
  )

export const revokeInvitation = (
  workspaceId: WorkspaceId.WorkspaceId,
  identity: Identity.MemberReference,
  invitationId: Invitation.InvitationId
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(InvitationService.InvitationService, (invitationService) =>
          invitationService.revoke(invitationId)
        )
      )
    )
  )

export const ownership = (workspaceId: WorkspaceId.WorkspaceId, identity: Identity.MemberReference) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(OwnershipService.OwnershipService, (ownershipService) => ownershipService.get)
      )
    )
  )
export const transferOwnership = (
  workspaceId: WorkspaceId.WorkspaceId,
  identity: Identity.MemberReference,
  input: Ownership.TransferInput
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(OwnershipService.OwnershipService, (ownershipService) => ownershipService.transfer(input))
      )
    )
  )

export const permissions = (workspaceId: WorkspaceId.WorkspaceId, identity: Identity.MemberReference) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) => assignmentService.permissions)
      )
    )
  )
export const access = (
  workspaceId: WorkspaceId.WorkspaceId,
  identity: Identity.MemberReference,
  memberId: MemberId.MemberId
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) => assignmentService.list(memberId))
      )
    )
  )
export const assign = (
  workspaceId: WorkspaceId.WorkspaceId,
  identity: Identity.MemberReference,
  input: Assignment.AssignInput
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) => assignmentService.assign(input))
      )
    )
  )
export const change = (
  workspaceId: WorkspaceId.WorkspaceId,
  identity: Identity.MemberReference,
  input: Assignment.ChangeInput
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) => assignmentService.change(input))
      )
    )
  )
export const revokeAssignment = (
  workspaceId: WorkspaceId.WorkspaceId,
  identity: Identity.MemberReference,
  memberId: MemberId.MemberId,
  assignmentId: Assignment.AssignmentId
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(
      gateway.asMember(
        workspaceId,
        identity,
        Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) =>
          assignmentService.revoke(memberId, assignmentId)
        )
      )
    )
  )
