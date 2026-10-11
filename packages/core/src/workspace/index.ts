/**
 * Workspaces: the workspace itself, its members, the invitations that admit people, who owns it,
 * and its settings. `Workspace`, `Member`, `Invitation`, and `Ownership` are the records;
 * `WorkspaceInitialization` creates a workspace with its creator as owner; `MemberService`,
 * `InvitationService`, `OwnershipService`, and `WorkspaceSettingsService` the operations an actor
 * calls; `MemberCommand` the write that admits a member, which other domains share; and the stores
 * the contracts every storage adapter implements.
 *
 * @since 0.1.0
 */

/**
 * An invitation's record: its issuance, the state it settles into, and the input that issues one.
 *
 * @since 0.1.0
 */
export * as Invitation from "./Invitation.ts";

/**
 * The operations on invitations: issuing, revoking, and listing them, and accepting one.
 *
 * @since 0.1.0
 */
export * as InvitationService from "./InvitationService.ts";

/**
 * The facts recorded about invitations.
 *
 * @since 0.1.0
 */
export * as InvitationFacts from "./InvitationFacts.ts";

/**
 * The projection that keeps the invitation read model.
 *
 * @since 0.1.0
 */
export * as InvitationProjection from "./InvitationProjection.ts";

/**
 * The action on invitations that needs a grant: managing them.
 *
 * @since 0.1.0
 */
export * as InvitationPermissions from "./InvitationPermissions.ts";

/**
 * The storage contract for invitations.
 *
 * @since 0.1.0
 */
export * as InvitationStore from "./InvitationStore.ts";

/**
 * A membership's record, its name rules, and the audience of one member.
 *
 * @since 0.1.0
 */
export * as Member from "./Member.ts";

/**
 * The operations on members an actor calls: reading, renaming oneself, and removing.
 *
 * @since 0.1.0
 */
export * as MemberService from "./MemberService.ts";

/**
 * The write that admits a member, shared by accepting invitations and creating agents.
 *
 * @since 0.1.0
 */
export * as MemberCommand from "./MemberCommand.ts";

/**
 * The facts recorded about memberships.
 *
 * @since 0.1.0
 */
export * as MemberFacts from "./MemberFacts.ts";

/**
 * The actions on members that need a grant: reading and removing one.
 *
 * @since 0.1.0
 */
export * as MemberPermissions from "./MemberPermissions.ts";

/**
 * The projection that keeps the membership read model.
 *
 * @since 0.1.0
 */
export * as MemberProjection from "./MemberProjection.ts";

/**
 * The storage contract for memberships.
 *
 * @since 0.1.0
 */
export * as MemberStore from "./MemberStore.ts";

/**
 * The workspace's record, its name rules, and the input that creates one.
 *
 * @since 0.1.0
 */
export * as Workspace from "./Workspace.ts";

/**
 * What a workspace's settings show and change.
 *
 * @since 0.1.0
 */
export * as WorkspaceSettings from "./WorkspaceSettings.ts";

/**
 * The operations behind a workspace's settings: reading them, listing members for management, and
 * renaming the workspace.
 *
 * @since 0.1.0
 */
export * as WorkspaceSettingsService from "./WorkspaceSettingsService.ts";

/**
 * The action on a workspace's settings that needs a grant: renaming it.
 *
 * @since 0.1.0
 */
export * as WorkspaceSettingsPermissions from "./WorkspaceSettingsPermissions.ts";

/**
 * Who owns the workspace, and the input and record of a transfer.
 *
 * @since 0.1.0
 */
export * as Ownership from "./Ownership.ts";

/**
 * The operations on ownership: reading it and transferring it.
 *
 * @since 0.1.0
 */
export * as OwnershipService from "./OwnershipService.ts";

/**
 * The action on ownership that needs a grant: transferring it.
 *
 * @since 0.1.0
 */
export * as OwnershipPermissions from "./OwnershipPermissions.ts";

/**
 * The facts recorded about the workspace itself.
 *
 * @since 0.1.0
 */
export * as WorkspaceFacts from "./WorkspaceFacts.ts";

/**
 * How a workspace is created, with its creator as owner, in one commit.
 *
 * @since 0.1.0
 */
export * as WorkspaceInitialization from "./WorkspaceInitialization.ts";

/**
 * The projection that keeps the workspace read model.
 *
 * @since 0.1.0
 */
export * as WorkspaceProjection from "./WorkspaceProjection.ts";

/**
 * The storage contract for the workspace's own record.
 *
 * @since 0.1.0
 */
export * as WorkspaceStore from "./WorkspaceStore.ts";
