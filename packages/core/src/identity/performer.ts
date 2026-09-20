import { Schema } from "effect";
import { MemberId } from "../workspace/member/id.ts";
import { Identity } from "./identity.ts";

export const SystemId = Schema.NonEmptyString.check(Schema.isTrimmed()).pipe(
  Schema.brand("SystemPerformerId"),
);
export type SystemId = typeof SystemId.Type;

/** Historical attribution, independent of the authority used to authorize an operation. */
export const Reference = Schema.TaggedUnion({
  Member: { memberId: MemberId.Id, identity: Identity.Reference },
  Identity: { identity: Identity.Reference },
  System: { id: SystemId },
});
export type Reference = typeof Reference.Type;

export * as Performer from "./performer.ts";
