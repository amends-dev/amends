import { Context, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Target } from "../authorization/target.ts";
import type { Actor } from "../identity/actor.ts";
import { Journal } from "../journal/journal.ts";
import type { Transaction } from "../journal/transaction.ts";
import { MemberPermissions } from "./member-permissions.ts";
import { MemberStore } from "./member-store.ts";
import { Member } from "./member.ts";
import { Workspace } from "./workspace.ts";

export class NotFound extends Schema.TaggedError<NotFound>()("MemberApplication.NotFound", {
  workspaceId: Workspace.Id,
  memberId: Member.Id,
}) {}

export class WorkspaceMismatch extends Schema.TaggedError<WorkspaceMismatch>()(
  "MemberApplication.WorkspaceMismatch",
  { expectedWorkspaceId: Workspace.Id, actualWorkspaceId: Workspace.Id },
) {}

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "MemberApplication.InvalidResponse",
  { message: Schema.String },
) {}

export type Error =
  | Authorization.Error
  | MemberStore.Failure
  | Transaction.Error
  | Schema.SchemaError
  | NotFound
  | WorkspaceMismatch
  | InvalidResponse;

export interface Interface {
  readonly workspaceId: Workspace.Id;
  /**
   * Read an active or removed membership after requiring member.read on it.
   * Authorization and lookup share one journal transaction, joining an existing
   * commit when present. Only authorized callers can receive NotFound.
   */
  readonly get: (memberId: Member.Id) => Effect.Effect<Member.Record, Error, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/workspace/member-application/Service",
) {}

const decodeId = Schema.decodeEffect(Member.Id);
const decodeMember = Schema.decodeEffect(Member.Record);
const requireWorkspace = Effect.fnUntraced(function* (
  expectedWorkspaceId: Workspace.Id,
  actualWorkspaceId: Workspace.Id,
) {
  if (expectedWorkspaceId !== actualWorkspaceId) {
    return yield* new WorkspaceMismatch({ expectedWorkspaceId, actualWorkspaceId });
  }
});

/** Bind workspace services; the host supplies Actor.Service separately for each call. */
export const make = Effect.fn("MemberApplication.make")(function* (): Effect.fn.Return<
  Interface,
  WorkspaceMismatch,
  MemberStore.Service | Authorization.Service | Journal.Service
> {
  const members = yield* MemberStore.Service;
  const authorization = yield* Authorization.Service;
  const journal = yield* Journal.Service;
  const workspaceId = authorization.workspaceId;
  yield* requireWorkspace(workspaceId, members.workspaceId);

  const get = Effect.fn("MemberApplication.get")(function* (memberId: Member.Id) {
    const id = yield* decodeId(memberId);
    yield* authorization.require([
      Requirement.make(
        MemberPermissions.Read,
        Target.Reference.cases.Member.make({ workspaceId, memberId: id }),
      ),
    ]);
    const found = yield* members.get(id);
    if (Option.isNone(found)) return yield* new NotFound({ workspaceId, memberId: id });
    const member = yield* decodeMember(found.value);
    yield* requireWorkspace(workspaceId, member.workspaceId);
    if (member.id !== id) {
      return yield* new InvalidResponse({ message: "Member store returned a different member ID" });
    }
    return member;
  }, journal.commit);

  return Service.of({ workspaceId, get });
});

export const layer = Layer.effect(Service, make());

export * as MemberApplication from "./member-application.ts";
