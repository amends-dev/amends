import type { AssignmentService } from "@amends-dev/core/authorization";
import type { ReadStateService } from "@amends-dev/core/read-state";
import type { ChangeFeedService } from "@amends-dev/core/change-feed";
import type { ConnectionService } from "@amends-dev/core/connection";
import type { AgentService } from "@amends-dev/core/agent";
import type {
  GroupService,
  GroupFollowService,
  GroupMembershipService,
} from "@amends-dev/core/group";
import type { NotificationService } from "@amends-dev/core/notification";
import type {
  ThreadService,
  ThreadMessageService,
  ThreadParticipationService,
} from "@amends-dev/core/thread";
import type {
  InvitationService,
  MemberService,
  OwnershipService,
  WorkspaceSettingsService,
} from "@amends-dev/core/workspace";
import { expectTypeOf, it } from "@effect/vitest";
import type { Effect } from "effect";
import type * as GatewayErrors from "../src/errors.ts";

/** What an operation, or an operation's result, can fail with. */
type Failure<T> =
  T extends Effect.Effect<unknown, infer E, unknown>
    ? E
    : T extends (...args: never) => infer R
      ? Failure<R>
      : never;
type ErrorsOf<Service> = { [Key in keyof Service]: Failure<Service[Key]> }[keyof Service];

/**
 * Failures that reveal nothing a caller can act on: storage, commit, projection, and consistency
 * failures, which the gateway answers as a server error, or maps to Conflict, Uncertain, or
 * InvalidInput itself.
 */
type Internal = {
  readonly _tag:
    | `${string}.Failure`
    | `${string}Store.Conflict`
    | `${string}.InvalidResponse`
    | `${string}.WorkspaceMismatch`
    | `Commit.${string}`
    | `Projection.${string}`
    | "JournalStore.CommitUncertain"
    | "Journal.FactMismatch"
    | "ThreadActivityKind.Mismatch"
    | "SchemaError"
    | "PlatformError"
    // Shared publishing declares these, but these operations never raise them: none asks for a
    // timeline position, and departures and self-follows admit only current members.
    | "ThreadCommand.PositionChanged"
    | "ThreadCommand.Unavailable";
};
/** An error that is neither: it would reach callers as a server error without anyone deciding so. */
type Unclassified<Service> = Exclude<ErrorsOf<Service>, GatewayErrors.PublicError | Internal>;

it("every error a core operation can fail with is public or internal, so none becomes a 500 unseen", () => {
  // A new domain outcome must join GatewayErrors.PublicError, or be named internal above.
  expectTypeOf<
    Unclassified<AssignmentService.AssignmentService["Service"]>
  >().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<ReadStateService.ReadStateService["Service"]>>().toEqualTypeOf<never>();
  expectTypeOf<
    Unclassified<ChangeFeedService.ChangeFeedService["Service"]>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Unclassified<ConnectionService.ConnectionService["Service"]>
  >().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<AgentService.AgentService["Service"]>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<GroupService.GroupService["Service"]>>().toEqualTypeOf<never>();
  expectTypeOf<
    Unclassified<GroupFollowService.GroupFollowService["Service"]>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Unclassified<GroupMembershipService.GroupMembershipService["Service"]>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Unclassified<NotificationService.NotificationService["Service"]>
  >().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<ThreadService.ThreadService["Service"]>>().toEqualTypeOf<never>();
  expectTypeOf<
    Unclassified<ThreadMessageService.ThreadMessageService["Service"]>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Unclassified<ThreadParticipationService.ThreadParticipationService["Service"]>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Unclassified<InvitationService.InvitationService["Service"]>
  >().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<MemberService.MemberService["Service"]>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<OwnershipService.OwnershipService["Service"]>>().toEqualTypeOf<never>();
  expectTypeOf<
    Unclassified<WorkspaceSettingsService.WorkspaceSettingsService["Service"]>
  >().toEqualTypeOf<never>();
});
