import { Schema } from "effect";
import { Member } from "../workspace/member/member.ts";
import { Requirement } from "./requirement.ts";

/** The outcomes `Authorization` reports that a caller can act on; schemas only, for contracts. */
export class Denied extends Schema.TaggedError<Denied>()("Authorization.Denied", {
  memberId: Member.Id,
  requirement: Requirement.Value,
}) {}
export class InvalidActor extends Schema.TaggedError<InvalidActor>()("Authorization.InvalidActor", {
  memberId: Member.Id,
  reason: Schema.Literals(["membership-missing", "membership-removed", "identity-mismatch"]),
}) {}

export * as AuthorizationErrors from "./errors.ts";
