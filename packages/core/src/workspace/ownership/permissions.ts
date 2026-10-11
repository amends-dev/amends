import * as Permission from "../../authorization/permission.ts";

export const Transfer = Permission.make("workspace.transfer-ownership", {
  targetKind: "Workspace",
  builtinTier: "owner",
});
