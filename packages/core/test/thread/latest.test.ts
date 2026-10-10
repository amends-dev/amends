import { Group, GroupFacts, GroupProjection, GroupStore } from "@amends-dev/core/group";
import {
  Thread,
  ThreadActivity,
  ThreadActivityFacts,
  ThreadActivityKind,
  ThreadFacts,
  ThreadMessage,
  ThreadMessageActivity,
  ThreadParticipation,
  ThreadParticipationActivity,
  ThreadProjection,
  ThreadStore,
} from "@amends-dev/core/thread";
import { Member } from "@amends-dev/core/workspace";
import { expect, it } from "@effect/vitest";
import { DateTime, Effect } from "effect";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Publication } from "../../src/journal/publication.ts";
import { Store } from "../../src/journal/store.ts";
import { WorkspaceId } from "../../src/workspace/id.ts";
import { make } from "../memory-store.ts";
import { testProvenance } from "../publication.ts";

const workspaceId = WorkspaceId.Id.make("workspace-one");
const logId = Log.Id.make("journal");
const groupId = Group.Id.make("group");
const threadId = Thread.Id.make("thread");
const memberId = Member.Id.make("member");
const at = (minute: number) =>
  DateTime.makeUnsafe(`2026-09-20T12:${String(minute).padStart(2, "0")}:00.000Z`);
const common = (sequence: number) => ({
  id: ThreadActivity.Id.make(`activity-${sequence}`),
  workspaceId,
  threadId,
  sequence,
  occurredAt: at(sequence),
});
const published = (sequence: number, messageId: string) =>
  ThreadActivityKind.makeRecordUnsafe(ThreadMessageActivity.Published, common(sequence), {
    messageId: ThreadMessage.Id.make(messageId),
  });

it.effect(
  "threads and groups each rebuild their latest activity from recorded activity alone",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      const inserted: Array<unknown> = [];
      const threadLatest: Array<Thread.Latest> = [];
      const groupLatest: Array<Group.Latest> = [];
      const threads: ThreadStore.Interface = {
        get: () => Effect.die("Unexpected thread read"),
        getMany: () => Effect.die("Unexpected thread read"),
        listByGroup: () => Effect.die("Unexpected thread read"),
        listByLatest: () => Effect.die("Unexpected thread read"),
        listByStart: () => Effect.die("Unexpected thread read"),
        getLatest: () => Effect.die("Unexpected thread read"),
        insert: (record) => Effect.sync(() => void inserted.push(record)),
        rename: () => Effect.die("Unexpected thread rename"),
        recordLatest: (latest) => Effect.sync(() => void threadLatest.push(latest)),
      };
      const groups: GroupStore.Interface = {
        get: () => Effect.die("Unexpected group read"),
        getMany: () => Effect.die("Unexpected group read"),
        findDirect: () => Effect.die("Unexpected group read"),
        pagePublic: () => Effect.die("Unexpected group read"),
        getLatest: () => Effect.die("Unexpected group read"),
        insert: (record) => Effect.sync(() => void inserted.push(record)),
        rename: () => Effect.die("Unexpected group rename"),
        recordLatest: (latest) => Effect.sync(() => void groupLatest.push(latest)),
      };
      const journal = <R>(program: Effect.Effect<void, unknown, R>) =>
        program.pipe(
          Effect.provideService(Publication.Service, testProvenance(workspaceId)),
          Effect.provide(Log.layer),
          Effect.provideService(Store.Service, fixture.store),
          Effect.provideService(Checkpoint.Service, fixture.checkpoints),
        );
      // History recorded before the projections existed, as a rebuild finds it.
      yield* journal(
        Effect.gen(function* () {
          const source = yield* Journal.make({ logId, projections: [] });
          yield* source.publish(GroupFacts.Created, {
            id: groupId,
            workspaceId,
            kind: "Team",
            visibility: "Private",
            name: "Team",
            createdBy: memberId,
            createdAt: at(0),
          });
          yield* source.publish(ThreadFacts.Created, {
            id: threadId,
            workspaceId,
            groupId,
            title: null,
            origin: null,
            createdBy: { _tag: "Member", memberId },
            createdAt: at(0),
          });
          const activities = [
            published(1, "first"),
            ThreadActivityKind.makeRecordUnsafe(ThreadParticipationActivity.Followed, common(2), {
              participationId: ThreadParticipation.Id.make("p"),
            }),
            published(3, "second"),
          ];
          for (const activity of activities)
            yield* source.publish(ThreadActivityFacts.Recorded, {
              groupId,
              activity,
              recipients: [],
            });
        }),
      );
      // Each projection rebuilds with its own store as the only one present.
      yield* journal(
        Effect.flatMap(
          Journal.make({ logId, projections: [ThreadProjection.definition] }),
          (rebuilt) => rebuilt.replay,
        ).pipe(Effect.provideService(ThreadStore.Service, threads)),
      );
      yield* journal(
        Effect.flatMap(
          Journal.make({ logId, projections: [GroupProjection.definition] }),
          (rebuilt) => rebuilt.replay,
        ).pipe(Effect.provideService(GroupStore.Service, groups)),
      );
      expect(inserted).toHaveLength(2);
      // Only messages move the latest activity; following a thread does not.
      expect(threadLatest).toEqual([
        { threadId, sequence: 1, occurredAt: at(1) },
        { threadId, sequence: 3, occurredAt: at(3) },
      ]);
      expect(groupLatest).toEqual([
        { groupId, occurredAt: at(1) },
        { groupId, occurredAt: at(3) },
      ]);
    }),
);
