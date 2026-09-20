import type { ChangeFeed } from "@amends/core/change-feed";
import { InvitationFacts, MemberFacts, type Workspace } from "@amends/core/workspace";
import { Cause, Data, Duration, Effect, Option, Schedule, Schema, Stream } from "effect";
import { Atom, Reactivity } from "effect/unstable/reactivity";
import { ApiClient } from "./client.ts";
import { isNotMember, isUnauthorized } from "./errors.ts";
import { keys } from "./keys.ts";

const added = Schema.decodeUnknownOption(MemberFacts.Added.payload);

/** Query dependencies live in the client. Unknown facts or versions refresh the workspace. */
export const invalidationKeys = (message: ChangeFeed.Message): ReadonlyArray<string> => {
  const workspaceId = message.workspaceId;
  const all = [keys.workspace(workspaceId), keys.me.workspaces];
  if (message._tag === "Ready") return all;
  const changed = new Set<string>();
  for (const event of message.events) {
    if (event.version !== 1) return all;
    switch (event.name) {
      case MemberFacts.Added.name: {
        const payload = added(event.payload);
        if (Option.isNone(payload) || payload.value.workspaceId !== workspaceId) return all;
        changed.add(keys.members.list(workspaceId));
        changed.add(keys.members.get(workspaceId, payload.value.memberId));
        changed.add(keys.ownership(workspaceId));
        changed.add(keys.me.workspaces);
        break;
      }
      case InvitationFacts.Issued.name:
      case InvitationFacts.Accepted.name:
      case InvitationFacts.Revoked.name:
        changed.add(keys.invitations.list(workspaceId));
        changed.add(keys.me.workspaces);
        break;
      default:
        // Access, ownership and membership removal can affect every readable workspace view.
        return all;
    }
  }
  return [...changed];
};

class Disconnected extends Data.TaggedError("Changes.Disconnected") {}

/** One live subscription per mounted workspace and session registry; no query polling. */
export const watch = Atom.family((workspaceId: Workspace.Id) =>
  ApiClient.runtime
    .atom(
      Stream.unwrap(
        Effect.gen(function* () {
          const client = yield* ApiClient;
          return yield* client.changes.watch({ params: { workspaceId } });
        }),
      ).pipe(
        Stream.tap((message) =>
          message.workspaceId === workspaceId
            ? Reactivity.invalidate(invalidationKeys(message))
            : Effect.fail(new Disconnected()),
        ),
        // A clean EOF also requires reconnecting; Ready refreshes any changes missed in the gap.
        Stream.concat(Stream.fail(new Disconnected())),
        Stream.retry(
          Schedule.exponential("500 millis").pipe(
            Schedule.jittered,
            Schedule.modifyDelay(({ duration }) =>
              Effect.succeed(Math.min(Duration.toMillis(duration), 30_000)),
            ),
            Schedule.while(
              ({ input }) => !isUnauthorized(Cause.fail(input)) && !isNotMember(Cause.fail(input)),
            ),
          ),
        ),
      ),
    )
    .pipe(Atom.setIdleTTL(0)),
);

export * as Changes from "./changes.ts";
