/**
 * The outcomes `Authorization` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's `Error` type adds the failures of what it depends on.
 */
import { Schema } from "effect";
import * as Member from "../../workspace/Member.ts";
import * as Requirement from "../Requirement.ts";

/**
 * No current grant of the member covers the requirement.
 */
export class Denied extends Schema.TaggedError<Denied>()("Authorization.Denied", {
  memberId: Member.Id,
  requirement: Requirement.Requirement,
}) {}

/**
 * The actor is not an active member of the workspace: the membership is missing or removed, or
 * its identity is not the actor's.
 */
export class InvalidActor extends Schema.TaggedError<InvalidActor>()("Authorization.InvalidActor", {
  memberId: Member.Id,
  reason: Schema.Literals(["membership-missing", "membership-removed", "identity-mismatch"]),
}) {}
