import { expect, test } from "bun:test";
import { Effect, Option } from "effect";
import { Identity } from "../../../src/identity/identity.ts";
import { Checkpoint } from "../../../src/journal/checkpoint.ts";
import { Journal } from "../../../src/journal/journal.ts";
import { Log } from "../../../src/journal/log.ts";
import { Store } from "../../../src/journal/store.ts";
import { CommittedEvents } from "../../../src/journal/committed-events.ts";
import { Transaction } from "../../../src/journal/transaction.ts";
import { MemberFacts } from "../../../src/workspace/member/facts.ts";
import { MemberProjection } from "../../../src/workspace/member/projection.ts";
import { MemberStore } from "../../../src/workspace/member/store.ts";
import { Member } from "../../../src/workspace/member/member.ts";
import { Workspace } from "../../../src/workspace/workspace.ts";
import { make, type Fixture } from "../../memory-store.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const logId = Log.Id.make("workspace-one/journal");
const firstId = Member.Id.make("member-one");
const secondId = Member.Id.make("member-two");
const agentId = Member.Id.make("member-agent");
const human = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("same-id") });
const agent = Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("same-id") });
const added = (memberId: Member.Id, identity: Identity.Reference) => ({
  memberId,
  workspaceId,
  identity,
});
const removed = (memberId: Member.Id) => ({ memberId, workspaceId });
const setup = Journal.make({ logId, projections: [MemberProjection.definition] });
const source = Journal.make({ logId, projections: [] });

const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    Log.Service | Transaction.Service | Checkpoint.Service | MemberStore.Service
  >,
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provide(Log.layer),
      Effect.provideService(Store.Service, fixture.store),
      Effect.provide(CommittedEvents.layer(workspaceId)),
      Effect.provideService(Checkpoint.Service, fixture.checkpoints),
      Effect.provideService(MemberStore.Service, fixture.members(workspaceId)),
    ),
  );

test("membership projection adds humans and agents, preserves removal, and admits a fresh membership", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* setup;
      const members = yield* MemberStore.Service;
      yield* journal.commit(
        Effect.gen(function* () {
          yield* journal.publish(MemberFacts.Added, added(firstId, human));
          expect(yield* members.findActive(human)).toEqual(
            Option.some({
              id: firstId,
              workspaceId,
              identity: human,
              status: "active",
            }),
          );
          yield* journal.publish(MemberFacts.Added, added(agentId, agent));
        }),
      );
      expect(yield* members.findActive(agent)).toEqual(
        Option.some({
          id: agentId,
          workspaceId,
          identity: agent,
          status: "active",
        }),
      );
      yield* journal.commit(
        Effect.gen(function* () {
          yield* journal.publish(MemberFacts.Removed, removed(firstId));
          expect(Option.isNone(yield* members.findActive(human))).toBe(true);
          yield* journal.publish(MemberFacts.Added, added(secondId, human));
        }),
      );
      expect(yield* members.get(firstId)).toEqual(
        Option.some({
          id: firstId,
          workspaceId,
          identity: human,
          status: "removed",
        }),
      );
      expect(yield* members.findActive(human)).toEqual(
        Option.some({
          id: secondId,
          workspaceId,
          identity: human,
          status: "active",
        }),
      );
      expect(
        yield* Effect.flip(journal.publish(MemberFacts.Added, added(firstId, human))),
      ).toMatchObject({
        _tag: "Projection.Failure",
        cause: { _tag: "MemberStore.Conflict", operation: "insert" },
      });
      expect(
        yield* Effect.flip(journal.publish(MemberFacts.Removed, removed(firstId))),
      ).toMatchObject({
        _tag: "Projection.Failure",
        cause: { _tag: "MemberStore.Conflict", operation: "markRemoved" },
      });
      yield* journal.replay;
      expect((yield* fixture.snapshot).members.size).toBe(3);
      expect((yield* journal.log.read({ limit: 10 })).map((batch) => batch.entries.length)).toEqual(
        [2, 2],
      );
    }),
  );
});

test("replay reconstructs membership history and resumes without reapplying additions", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* source;
      yield* journal.publish(MemberFacts.Added, added(firstId, human));
      yield* journal.commit(
        Effect.gen(function* () {
          yield* journal.publish(MemberFacts.Removed, removed(firstId));
          yield* journal.publish(MemberFacts.Added, added(secondId, human));
          yield* journal.publish(MemberFacts.Added, added(agentId, agent));
        }),
      );
      expect((yield* fixture.snapshot).members.size).toBe(0);
      yield* (yield* setup).replay;
      const members = yield* MemberStore.Service;
      expect(yield* members.get(firstId)).toEqual(
        Option.some({
          id: firstId,
          workspaceId,
          identity: human,
          status: "removed",
        }),
      );
      expect(Option.map(yield* members.findActive(human), (member) => member.id)).toEqual(
        Option.some(secondId),
      );
      expect(Option.map(yield* members.findActive(agent), (member) => member.id)).toEqual(
        Option.some(agentId),
      );
    }),
  );
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* setup;
      yield* journal.replay;
      expect((yield* fixture.snapshot).members.size).toBe(3);
      expect(yield* journal.log.read({ limit: 10 })).toHaveLength(2);
    }),
  );
});

test("workspace mismatches reject added and removed facts during publication and replay", async () => {
  const fixture = await Effect.runPromise(make());
  const foreign = Workspace.Id.make("another-workspace");
  const mismatch = {
    _tag: "Projection.Failure",
    cause: {
      _tag: "MemberProjection.WorkspaceMismatch",
      expectedWorkspaceId: workspaceId,
      actualWorkspaceId: foreign,
    },
  };
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* setup;
      expect(
        yield* Effect.flip(
          journal.publish(MemberFacts.Added, {
            memberId: firstId,
            workspaceId: foreign,
            identity: human,
          }),
        ),
      ).toMatchObject(mismatch);
      expect((yield* fixture.snapshot).members.size).toBe(0);
      expect((yield* fixture.snapshot).logs.size).toBe(0);
      yield* journal.publish(MemberFacts.Added, added(firstId, human));
      const before = yield* fixture.snapshot;
      const foreignRemoval = { memberId: firstId, workspaceId: foreign };
      expect(
        yield* Effect.flip(journal.publish(MemberFacts.Removed, foreignRemoval)),
      ).toMatchObject(mismatch);
      expect((yield* fixture.snapshot).members).toEqual(before.members);
      expect((yield* fixture.snapshot).checkpoints).toEqual(before.checkpoints);
      // Simulate history written without this projection, then attempt to replay it.
      yield* (yield* source).publish(MemberFacts.Removed, foreignRemoval);
      expect(yield* Effect.flip(journal.replay)).toMatchObject(mismatch);
      expect((yield* fixture.snapshot).members).toEqual(before.members);
      expect((yield* fixture.snapshot).checkpoints).toEqual(before.checkpoints);
    }),
  );
});

test("a caught membership conflict rolls back the journal, member records, and checkpoint", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* setup;
      const failure = yield* Effect.flip(
        journal.commit(
          Effect.gen(function* () {
            yield* journal.publish(MemberFacts.Added, added(firstId, human));
            yield* journal
              .publish(MemberFacts.Added, added(secondId, human))
              .pipe(Effect.catch(() => Effect.void));
          }),
        ),
      );
      expect(failure._tag).toBe("Commit.Aborted");
      const state = yield* fixture.snapshot;
      expect(state.members.size).toBe(0);
      expect(state.logs.size).toBe(0);
      expect(state.checkpoints.size).toBe(0);
      const outcomes = yield* Effect.forEach(
        [firstId, secondId],
        (id) =>
          journal
            .publish(MemberFacts.Added, added(id, human))
            .pipe(Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "success" })),
        { concurrency: "unbounded" },
      );
      expect(outcomes.filter((outcome) => outcome === "success")).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome === "Projection.Failure")).toHaveLength(1);
      expect((yield* fixture.snapshot).members.size).toBe(1);
      expect(yield* journal.log.read({ limit: 10 })).toHaveLength(1);
    }),
  );
});

test("a failed removal rolls back the entire replay batch while retaining earlier progress", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const writer = yield* source;
      yield* writer.publish(MemberFacts.Added, added(firstId, human));
      yield* writer.commit(
        Effect.gen(function* () {
          yield* writer.publish(MemberFacts.Removed, removed(firstId));
          yield* writer.publish(MemberFacts.Removed, removed(Member.Id.make("missing")));
        }),
      );
      const journal = yield* setup;
      expect(yield* Effect.flip(journal.replay)).toMatchObject({
        _tag: "Projection.Failure",
        cause: { _tag: "MemberStore.Conflict", operation: "markRemoved" },
      });
      expect(yield* (yield* MemberStore.Service).get(firstId)).toEqual(
        Option.some({
          id: firstId,
          workspaceId,
          identity: human,
          status: "active",
        }),
      );
      const cursor = yield* fixture.checkpoints.get({
        logId,
        name: MemberProjection.definition.name,
        version: MemberProjection.definition.version,
      });
      expect(Option.isSome(cursor) && cursor.value.position).toBe(Log.Position.make(0));
      expect(yield* journal.log.read({ limit: 10 })).toHaveLength(2);
    }),
  );
});

test("membership changes roll back when the checkpoint cannot be persisted", async () => {
  const fixture = await Effect.runPromise(make());
  const failure = new Store.Failure({ operation: "checkpoint.set", cause: "unavailable" });
  const broken: Fixture = {
    ...fixture,
    checkpoints: Checkpoint.Service.of({
      ...fixture.checkpoints,
      set: () => Effect.fail(failure),
    }),
  };
  await run(
    broken,
    Effect.gen(function* () {
      const journal = yield* setup;
      expect(yield* Effect.flip(journal.publish(MemberFacts.Added, added(firstId, human)))).toBe(
        failure,
      );
      const state = yield* fixture.snapshot;
      expect(state.members.size).toBe(0);
      expect(state.logs.size).toBe(0);
      expect(state.checkpoints.size).toBe(0);
    }),
  );
});
