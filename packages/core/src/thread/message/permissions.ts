import { Permission } from "../../authorization/permission.ts";
export const Publish = Permission.make("thread.publish", {
  targetKind: "Thread",
  builtinTier: "member",
});

export * as ThreadMessagePermissions from "./permissions.ts";
