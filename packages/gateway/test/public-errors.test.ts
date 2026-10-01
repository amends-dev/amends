import type { AssignmentApplication } from "@amends/core/authorization";
import type { ReadStateApplication } from "@amends/core/read-state";
import type { ChangeFeedApplication } from "@amends/core/change-feed";
import type { ConnectionApplication } from "@amends/core/connection";
import type {
  GroupApplication,
  GroupFollowApplication,
  GroupMembershipApplication,
} from "@amends/core/group";
import type { NotificationApplication } from "@amends/core/notification";
import type { SignalApplication } from "@amends/core/signal";
import type {
  ThreadApplication,
  ThreadMessageApplication,
  ThreadParticipationApplication,
} from "@amends/core/thread";
import type {
  InvitationApplication,
  MemberApplication,
  OwnershipApplication,
  WorkspaceSettingsApplication,
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
  expectTypeOf<Unclassified<AssignmentApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<ReadStateApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<ChangeFeedApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<ConnectionApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<GroupApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<GroupFollowApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<GroupMembershipApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<NotificationApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<SignalApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<ThreadApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<ThreadMessageApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<ThreadParticipationApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<InvitationApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<MemberApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<OwnershipApplication.Interface>>().toEqualTypeOf<never>();
  expectTypeOf<Unclassified<WorkspaceSettingsApplication.Interface>>().toEqualTypeOf<never>();
});
