import * as Permission from "../authorization/Permission.ts";
export const Rename = Permission.make("workspace.rename", {
  targetKind: "Workspace",
  builtinTier: "owner",
});
