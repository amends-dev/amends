import { Permission } from "../../authorization/permission.ts";

export const Transfer = Permission.make("workspace.transfer-ownership", {
  targetKind: "Workspace",
  builtinTier: "owner",
});

export * as OwnershipPermissions from "./permissions.ts";
