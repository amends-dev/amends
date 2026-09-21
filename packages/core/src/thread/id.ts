import { Schema } from "effect";

export const Id = Schema.NonEmptyString.pipe(Schema.brand("ThreadId"));
export type Id = typeof Id.Type;

export * as ThreadId from "./id.ts";
