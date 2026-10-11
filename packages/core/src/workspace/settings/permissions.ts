import * as Permission from "../../authorization/permission.ts";
export const Rename = Permission.make("workspace.rename", {
  targetKind: "Workspace",
  builtinTier: "owner",
});
