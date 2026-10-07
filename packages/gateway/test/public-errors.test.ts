import type { AssignmentService } from "@amends/core/authorization";
import type { ReadStateService } from "@amends/core/read-state";
import type { ChangeFeedService } from "@amends/core/change-feed";
import type { ConnectionV2Service } from "@amends/core/connection-v2";
import type { AgentV2Service } from "@amends/core/agent-v2";
import type { GroupService, GroupFollowService, GroupMembershipService } from "@amends/core/group";
import type { NotificationService } from "@amends/core/notification";
import type {
  ThreadService,
  ThreadMessageService,
  ThreadParticipationService,
} from "@amends/core/thread";
import type {
  InvitationService,
  MemberService,
  OwnershipService,
  WorkspaceSettingsService,
} from "@amends/core/workspace";
import { expectTypeOf, it } from "@effect/vitest";
import type { Effect } from "effect";
import type { GatewayErrors } from "../src/errors.ts";

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
  expectTypeOf<Unclassified<AssignmentService.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<ReadStateService.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<ChangeFeedService.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<ConnectionV2Service.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<AgentV2Service.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<GroupService.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<GroupFollowService.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<GroupMembershipService.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<NotificationService.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<ThreadService.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<ThreadMessageService.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<ThreadParticipationService.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<InvitationService.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<MemberService.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<OwnershipService.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<WorkspaceSettingsService.Interface>>().toEqualTypeOf<never>();
});
