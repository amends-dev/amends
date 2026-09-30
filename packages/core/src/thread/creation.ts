import { Context, Effect, Layer, Option, Schema } from "effect";
import { Group } from "../group/group.ts";
import { GroupStore } from "../group/store.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { Journal } from "../journal/journal.ts";
import { Store } from "../journal/store.ts";
import type { Event } from "../journal/event.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Thread } from "./thread.ts";
import { ThreadFacts } from "./facts.ts";

export class InvalidReference extends Schema.TaggedError<InvalidReference>()(
  "ThreadCreation.InvalidReference",
  { message: Schema.String },
) {}
export const Input = Schema.Struct({
  /** The caller names the thread, so a keyed request can name the same one on its retry. */
  id: Thread.Id,
  groupId: Group.Id,
  createdBy: Thread.Record.fields.createdBy,
  createdAt: Schema.DateTimeUtcFromString,
});
export interface Input extends Schema.Schema.Type<typeof Input> {}
export type Error =
  | InvalidReference
  | Schema.SchemaError
  | GroupStore.Failure
  | MemberStore.Failure
  | Log.WriteError
  | Projection.Error;
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
  /** Internal creation within an already-authorized workflow and transaction. */
  readonly create: (
    input: Input,
  ) => Effect.Effect<
    Event.Type<typeof ThreadFacts.Created>,
    Error,
    Store.Transaction | Publication.Service
  >;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/creation/Service",
) {}
/** Capture domain dependencies without capturing actor or transaction authority. @category constructors */
export const make = Effect.fn("ThreadCreation.make")(function* () {
  const groups = yield* GroupStore.Service;
  const members = yield* MemberStore.Service;
  const journal = yield* Journal.Service;
  const workspaceId = groups.workspaceId;
  if (members.workspaceId !== workspaceId)
    return yield* new InvalidReference({
      message: "Thread creation services belong to different workspaces",
    });
  const create = Effect.fn("ThreadCreation.create")(function* (input: Input) {
    yield* Store.Transaction;
    const checked = yield* Schema.decodeEffect(Schema.toType(Input))(input);
    const foundGroup = yield* groups.get(checked.groupId);
    if (Option.isNone(foundGroup))
      return yield* new InvalidReference({ message: "Thread group is missing" });
    const group = yield* Schema.decodeEffect(Schema.toType(Group.Record))(foundGroup.value);
    if (group.workspaceId !== workspaceId || group.id !== checked.groupId)
      return yield* new InvalidReference({ message: "Thread group is inconsistent" });
    // A member creator must be active here; a contact creator is identified by its channel.
    const creator = checked.createdBy;
    if (creator._tag === "Member") {
      const foundMember = yield* members.get(creator.memberId);
      if (Option.isNone(foundMember))
        return yield* new InvalidReference({ message: "Thread creator is missing" });
      const member = yield* Schema.decodeEffect(Member.Record)(foundMember.value);
      if (
        member.workspaceId !== workspaceId ||
        member.id !== creator.memberId ||
        member.status !== "active"
      )
        return yield* new InvalidReference({
          message: "Thread creator is inconsistent or inactive",
        });
    }
    return yield* journal
      .publish(ThreadFacts.Created, {
        id: checked.id,
        workspaceId,
        groupId: group.id,
        createdBy: creator,
        createdAt: checked.createdAt,
      })
      .pipe(Publication.withOccurredAt(checked.createdAt));
  });
  return Service.of({ workspaceId, create });
});
/** Internal service: callers own workflow authorization. @category layers */
export const layer = Layer.effect(Service, make());
export * as ThreadCreation from "./creation.ts";
