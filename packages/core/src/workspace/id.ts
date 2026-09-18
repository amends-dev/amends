import { Schema } from "effect";

export const Id = Schema.NonEmptyString.pipe(Schema.brand("WorkspaceId"));
export type Id = typeof Id.Type;

export * as WorkspaceId from "./id.ts";
