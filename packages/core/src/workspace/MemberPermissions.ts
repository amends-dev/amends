import * as Permission from "../authorization/Permission.ts";

const member = Permission.makeGroup("member", { targetKind: "Member" });

export const Read = member.make("read", { builtinTier: "member" });
export const Remove = member.make("remove", { builtinTier: "administrator" });
