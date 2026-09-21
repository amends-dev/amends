import { Permission } from "../authorization/permission.ts";
export const Start = Permission.make("thread.start", {
  targetKind: "Group",
  builtinTier: "viewer",
});
/** Conversation reads also require current membership in the thread's group. */
export const Read = Permission.make("thread.read", {
  targetKind: "Thread",
  builtinTier: "viewer",
});
export * as ThreadPermissions from "./permissions.ts";
