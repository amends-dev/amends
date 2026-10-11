import * as Permission from "./Permission.ts";

const assignment = Permission.makeGroup("assignment", { targetKind: "Member" });
export const Read = assignment.make("read", { builtinTier: "member" });
export const Manage = assignment.make("manage", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});
