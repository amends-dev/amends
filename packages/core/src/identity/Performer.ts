import { Schema } from "effect";
import * as MemberId from "../workspace/MemberId.ts";
import * as Identity from "./Identity.ts";

export const SystemId = Schema.NonEmptyString.check(Schema.isTrimmed()).pipe(
  Schema.brand("SystemPerformerId"),
);
export type SystemId = typeof SystemId.Type;

/** Historical attribution, independent of the authority used to authorize an operation. */
export const Reference = Schema.TaggedUnion({
  Member: { memberId: MemberId.Id, identity: Identity.MemberReference },
  Identity: { identity: Identity.Reference },
  System: { id: SystemId },
});
export type Reference = typeof Reference.Type;
