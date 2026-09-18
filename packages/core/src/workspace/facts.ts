import { Fact } from "../journal/fact.ts";
import { Workspace } from "./workspace.ts";

export const Initialized = Fact.make("workspace.initialized", {
  version: 1,
  payload: Workspace.Record,
});

export * as WorkspaceFacts from "./facts.ts";
