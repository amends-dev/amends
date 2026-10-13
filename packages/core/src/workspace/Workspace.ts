/**
 * The workspace itself: its record, as `WorkspaceInitialization` creates it and `WorkspaceStore`
 * keeps it, the name rules its settings share, and the input that creates one. Members,
 * invitations, ownership, and settings each have a module of their own beside it.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import * as Identity from "../identity/Identity.ts";
import * as WorkspaceId from "./WorkspaceId.ts";
import * as MemberId from "./MemberId.ts";
import * as Member from "./Member.ts";
import * as Text from "../text/Text.ts";

/**
 * Names a workspace; `WorkspaceId.Id`, where models that only refer to workspaces import it from.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = WorkspaceId.Id;

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = WorkspaceId.Id;

/**
 * A workspace's name as recorded: trimmed and not empty. Names chosen now are `NewName`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Name = Schema.Trimmed.check(Schema.isMinLength(1));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Name = typeof Name.Type;

/**
 * A name chosen for a workspace: 1 to 80 characters, without hidden ones.
 *
 * @category schemas
 * @since 0.1.0
 */
export const NewName = Name.check(Schema.isMaxLength(Text.nameLength), Text.isName);

/**
 * A new workspace's name, and what its creator is called there: what
 * `WorkspaceInitialization.initialize` takes.
 *
 * @category options
 * @since 0.1.0
 */
export const CreateInput = Schema.Struct({
  name: NewName,
  memberName: Member.NewName,
}).annotate({
  identifier: "WorkspaceCreateInput",
});

/**
 * @category options
 * @since 0.1.0
 */
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

/**
 * A workspace as `WorkspaceStore` keeps it: its ID and name, the person who created it, and the
 * member who owns it now. `createdBy` stays fixed when ownership is transferred; `ownerMemberId`
 * moves with it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Workspace = Schema.Struct({
  id: Id,
  name: Name,
  createdBy: Identity.HumanId,
  ownerMemberId: MemberId.Id,
}).annotate({ identifier: "Workspace" });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Workspace extends Schema.Schema.Type<typeof Workspace> {}
