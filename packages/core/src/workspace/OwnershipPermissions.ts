import * as Permission from "../authorization/Permission.ts";

export const Transfer = Permission.make("workspace.transfer-ownership", {
  targetKind: "Workspace",
  builtinTier: "owner",
});
