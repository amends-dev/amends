import { Schema } from "effect";
export const Id = Schema.NonEmptyString.pipe(Schema.brand("ThreadMessageId"));

export type Id = typeof Id.Type;

export * as ThreadMessageId from "./id.ts";
