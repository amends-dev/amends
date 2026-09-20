import { Fact } from "../journal/fact.ts";
import { Workspace } from "./workspace.ts";
import { Ownership } from "./ownership/ownership.ts";

export const Initialized = Fact.make("workspace.initialized", {
  version: 1,
  payload: Workspace.Record,
  occurrence: (payload) => [payload.id],
});

export const OwnershipTransferred = Fact.make("workspace.ownership-transferred", {
  version: 1,
  payload: Ownership.Change,
});

export * as WorkspaceFacts from "./facts.ts";
