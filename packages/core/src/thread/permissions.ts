import { Permission } from "../authorization/permission.ts";
export const Start = Permission.make("thread.start", {
  targetKind: "Group",
  builtinTier: "viewer",
});
export * as ThreadPermissions from "./permissions.ts";
