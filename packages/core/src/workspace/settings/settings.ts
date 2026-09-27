import { Schema } from "effect";
import { Assignment } from "../../authorization/assignment/assignment.ts";
import { Member } from "../member/member.ts";
import { Workspace } from "../workspace.ts";
export const RenameInput = Schema.Struct({
  name: Workspace.NewName,
  expectedName: Workspace.Name,
}).annotate({ identifier: "WorkspaceRenameInput" });
export interface RenameInput extends Schema.Schema.Type<typeof RenameInput> {}
export const NameChange = Schema.Struct({
  workspaceId: Workspace.Id,
  previousName: Workspace.Name,
  name: Workspace.Name,
});
export interface NameChange extends Schema.Schema.Type<typeof NameChange> {}
export const View = Schema.Struct({
  workspace: Workspace.Record,
  canRename: Schema.Boolean,
  canReadInvitations: Schema.Boolean,
  canInvite: Schema.Boolean,
  roles: Schema.Array(Assignment.RoleChoice),
}).annotate({ identifier: "WorkspaceSettingsView" });
export interface View extends Schema.Schema.Type<typeof View> {}
export const MemberEntry = Schema.Struct({
  member: Member.Record,
  access: Schema.NullOr(Assignment.Access),
  canRemove: Schema.Boolean,
}).annotate({ identifier: "WorkspaceMemberManagementEntry" });
export interface MemberEntry extends Schema.Schema.Type<typeof MemberEntry> {}
export * as WorkspaceSettings from "./settings.ts";
