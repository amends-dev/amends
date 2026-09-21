import { Permission } from "../../authorization/permission.ts";
export const Follow = Permission.make("thread.follow", {
  targetKind: "Thread",
  builtinTier: "viewer",
});
export * as ThreadParticipationPermissions from "./permissions.ts";
