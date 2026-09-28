import { Schema } from "effect";

export const Id = Schema.NonEmptyString.pipe(Schema.brand("EnvironmentId"));
export type Id = typeof Id.Type;

export * as EnvironmentId from "./id.ts";
