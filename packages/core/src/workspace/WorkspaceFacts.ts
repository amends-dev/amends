/**
 * The facts recorded about the workspace itself: its initialization, each rename, and each
 * transfer of its ownership. Members and invitations have facts of their own, in `MemberFacts` and
 * `InvitationFacts`. `WorkspaceProjection` keeps `WorkspaceStore` from these.
 *
 * @since 0.1.0
 */
import * as Subject from "../journal/Subject.ts";
import * as Audience from "../journal/Audience.ts";
import * as Fact from "../journal/Fact.ts";
import * as Workspace from "./Workspace.ts";
import * as Ownership from "./Ownership.ts";
import * as WorkspaceSettings from "./WorkspaceSettings.ts";

/**
 * The workspace's name changed, from `previousName` to `name`; each rename is its own fact, which
 * `WorkspaceSettingsService.rename` publishes. Every member may learn of it.
 *
 * @category facts
 * @since 0.1.0
 */
export const Renamed = Fact.make("workspace.renamed", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("workspace", payload.workspaceId),
  version: 1,
  payload: WorkspaceSettings.NameChange,
});

/**
 * The workspace was created, as its record says: the first fact in its journal, which
 * `WorkspaceInitialization.initialize` publishes once, before the creator's membership, the
 * built-in roles, and the general group in the same commit.
 *
 * @category facts
 * @since 0.1.0
 */
export const Initialized = Fact.make("workspace.initialized", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("workspace", payload.id),
  version: 1,
  payload: Workspace.Record,
  occurrence: (payload) => [payload.id],
});

/**
 * Ownership moved from one member to another, as `Ownership.Change` says.
 * `OwnershipService.transfer` publishes it in the commit that also replaces both members' built-in
 * workspace roles.
 *
 * @category facts
 * @since 0.1.0
 */
export const OwnershipTransferred = Fact.make("workspace.ownership-transferred", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("workspace", payload.workspaceId),
  version: 1,
  payload: Ownership.Change,
});
