import { Schema } from "effect";
import * as Workspace from "../workspace/Workspace.ts";
import * as Target from "./Target.ts";

/** The resources a grant covers: a whole workspace or one exact target. */
export const Value = Schema.TaggedUnion({
  Workspace: { workspaceId: Workspace.Id },
  Target: { target: Target.Reference },
});
export type Value = typeof Value.Type;

const equivalentTarget = Schema.toEquivalence(Target.Reference);

/**
 * Checks resource coverage within the same workspace. Authorization must also
 * check the permission, its target kind, and the acting member's current grants.
 */
export const covers = (scope: Value, target: Target.Reference): boolean =>
  Value.match(scope, {
    Workspace: ({ workspaceId }) => workspaceId === target.workspaceId,
    Target: ({ target: exact }) => equivalentTarget(exact, target),
  });
