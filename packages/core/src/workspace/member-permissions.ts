import { Permission } from "../authorization/permission.ts";

const member = Permission.group("member", { targetKind: "Member" });

export const Read = member.make("read");
export const Remove = member.make("remove");

export * as MemberPermissions from "./member-permissions.ts";
