/**
 * What a workspace's settings show and change: the view of the workspace with what the actor may
 * do there, the entries member management lists, and the input of a rename with the change it
 * records. `WorkspaceSettingsService` serves them.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Assignment from "../authorization/Assignment.ts"
import * as Member from "./Member.ts"
import * as Workspace from "./Workspace.ts"

/**
 * A new name for the workspace, and the name the renamer last saw, which
 * `WorkspaceSettingsService.rename` compares to the current one.
 *
 * @category options
 * @since 0.1.0
 */
export const RenameInput = Schema.Struct({
  name: Workspace.NewName,
  expectedName: Workspace.Name
}).annotate({ identifier: "WorkspaceRenameInput" })

/**
 * @category options
 * @since 0.1.0
 */
export interface RenameInput extends Schema.Schema.Type<typeof RenameInput> {}

/**
 * A recorded rename, from `previousName` to `name`: the payload of `WorkspaceFacts.Renamed`, which
 * `WorkspaceStore.rename` applies.
 *
 * @category schemas
 * @since 0.1.0
 */
export const NameChange = Schema.Struct({
  workspaceId: Workspace.Id,
  previousName: Workspace.Name,
  name: Workspace.Name
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface NameChange extends Schema.Schema.Type<typeof NameChange> {}

/**
 * The workspace as its settings show it, with what the actor may do there, so clients offer only
 * the actions the actor may take.
 *
 * @category schemas
 * @since 0.1.0
 */
export const View = Schema.Struct({
  workspace: Workspace.Workspace,
  /** Whether the actor holds `workspace.rename`. */
  canRename: Schema.Boolean,
  /** Whether the actor holds `invitation.manage`, which listing invitations needs. */
  canReadInvitations: Schema.Boolean,
  /** Whether the actor may issue an invitation: manage them, and have a role to delegate. */
  canInvite: Schema.Boolean,
  /** The built-in roles, each with whether the actor may assign it. */
  roles: Schema.Array(Assignment.RoleChoice)
}).annotate({ identifier: "WorkspaceSettingsView" })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface View extends Schema.Schema.Type<typeof View> {}

/**
 * One member as management lists them: the record, their access, and whether the actor may remove
 * them.
 *
 * @category schemas
 * @since 0.1.0
 */
export const MemberEntry = Schema.Struct({
  member: Member.Member,
  /**
   * The member's assignments and whether the actor may change them; null when the actor may not
   * read them.
   */
  access: Schema.NullOr(Assignment.Access),
  /** Whether the actor may remove the member, by the delegation rule removal itself enforces. */
  canRemove: Schema.Boolean
}).annotate({ identifier: "WorkspaceMemberManagementEntry" })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface MemberEntry extends Schema.Schema.Type<typeof MemberEntry> {}
