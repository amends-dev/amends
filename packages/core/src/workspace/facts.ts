import { Subject } from "../journal/subject.ts";
import { Audience } from "../journal/audience.ts";
import { Fact } from "../journal/fact.ts";
import { Workspace } from "./workspace.ts";
import { Ownership } from "./ownership/ownership.ts";
import { WorkspaceSettings } from "./settings/settings.ts";
export const Renamed = Fact.make("workspace.renamed", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("workspace", payload.workspaceId),
  version: 1,
  payload: WorkspaceSettings.NameChange,
});

export const Initialized = Fact.make("workspace.initialized", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("workspace", payload.id),
  version: 1,
  payload: Workspace.Record,
  occurrence: (payload) => [payload.id],
});

export const OwnershipTransferred = Fact.make("workspace.ownership-transferred", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("workspace", payload.workspaceId),
  version: 1,
  payload: Ownership.Change,
});

export * as WorkspaceFacts from "./facts.ts";
