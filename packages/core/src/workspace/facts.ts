import { Subject } from "../journal/subject.ts";
import { Fact } from "../journal/fact.ts";
import { Workspace } from "./workspace.ts";
import { Ownership } from "./ownership/ownership.ts";

export const Initialized = Fact.make("workspace.initialized", {
  subject: (payload) => Subject.make("workspace", payload.id),
  version: 1,
  payload: Workspace.Record,
  occurrence: (payload) => [payload.id],
});

export const OwnershipTransferred = Fact.make("workspace.ownership-transferred", {
  subject: (payload) => Subject.make("workspace", payload.workspaceId),
  version: 1,
  payload: Ownership.Change,
});

export * as WorkspaceFacts from "./facts.ts";
