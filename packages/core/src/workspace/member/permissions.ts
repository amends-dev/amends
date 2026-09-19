import { Permission } from "../../authorization/permission.ts";

const member = Permission.makeGroup("member", { targetKind: "Member" });

export const Read = member.make("read", { builtinTier: "viewer" });
export const Remove = member.make("remove", { builtinTier: "administrator" });

export * as MemberPermissions from "./permissions.ts";
