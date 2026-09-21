import { BuiltinRoles, Scope, type Role } from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import { Invitation, Workspace } from "@amends/core/workspace";
import type { Gateway } from "@amends/gateway";
import { Clock, DateTime, Effect } from "effect";
import type { SqlClient } from "effect/unstable/sql";
import type { SqliteDatabase } from "../src/database.ts";
import { bob, host } from "./support.ts";
export { alice, bob, bind, type Bound, views, core, temporary, boundTo } from "./support.ts";
export const charlie = Identity.Reference.cases.Human.make({
  id: Identity.HumanId.make("charlie"),
});
export const runHost = <A, E>(
  filename: string,
  program: Effect.Effect<A, E, Gateway.Service | SqliteDatabase.Service | SqlClient.SqlClient>,
) => program.pipe(Effect.provide(host(filename)));

export const scope = (workspaceId: Workspace.Id) =>
  Scope.Value.cases.Workspace.make({ workspaceId });
export const request = (
  _workspaceId: Workspace.Id,
  expiresAt: DateTime.Utc,
  recipientId = bob.id,
  roleId: Role.Id = BuiltinRoles.ViewerId,
): Invitation.IssueInput => ({
  recipientId,
  expiresAt,
  roleId,
});
export const future = DateTime.now.pipe(Effect.map((now) => DateTime.add(now, { hours: 1 })));
export const at = <A, E, R>(time: DateTime.Utc, program: Effect.Effect<A, E, R>) =>
  Effect.clockWith((clock) =>
    program.pipe(
      Effect.provideService(Clock.Clock, {
        currentTimeMillis: Effect.succeed(DateTime.toEpochMillis(time)),
        currentTimeMillisUnsafe: () => DateTime.toEpochMillis(time),
        currentTimeNanos: Effect.succeed(BigInt(DateTime.toEpochMillis(time)) * 1_000_000n),
        currentTimeNanosUnsafe: () => BigInt(DateTime.toEpochMillis(time)) * 1_000_000n,
        monotonicTimeNanos: clock.monotonicTimeNanos,
        monotonicTimeNanosUnsafe: () => clock.monotonicTimeNanosUnsafe(),
        sleep: (duration) => clock.sleep(duration),
      }),
    ),
  );
