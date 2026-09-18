import { Schema } from "effect";

/** Identifies one admission to a workspace; rejoining creates a new membership. */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("WorkspaceMemberId"));
export type Id = typeof Id.Type;

export * as MemberId from "./id.ts";
