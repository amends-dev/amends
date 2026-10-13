/**
 * The person an endpoint only a person may call acts for.
 */
import { CoreError } from "@amends-dev/core/error";
import { Identity } from "@amends-dev/core/identity";
import { Effect } from "effect";
import * as Authentication from "../Authentication.ts";

/** The principal as the person it is, or `CoreError.Denied` (`HumanRequired`) for an agent. */
export const requireHuman = Effect.gen(function* () {
  const principal = yield* Authentication.Principal;
  if (!Identity.MemberReference.isAnyOf(["Human"])(principal))
    return yield* new CoreError.Denied({ reason: new CoreError.HumanRequired() });
  return principal;
});
