import { Permission } from "../permission.ts";

const assignment = Permission.makeGroup("assignment", { targetKind: "Member" });
export const Read = assignment.make("read", { builtinTier: "member" });
export const Manage = assignment.make("manage", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});

export * as AssignmentPermissions from "./permissions.ts";
