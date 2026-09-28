import { Audience } from "../journal/audience.ts";
import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { Environment } from "./environment.ts";

/** Environments are workspace configuration: every member may learn of changes to them. */
const workspace = () => [Audience.workspace];

export const Created = Fact.make("environment.created", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("environment", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Environment.Record,
});

export const Renamed = Fact.make("environment.renamed", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("environment", payload.environmentId),
  payload: Environment.Renamed,
});

/** Its sandbox settings replaced as a whole. */
export const Configured = Fact.make("environment.configured", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("environment", payload.environmentId),
  payload: Environment.Configured,
});

/** Removed from use; its record remains for history. */
export const Removed = Fact.make("environment.removed", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("environment", payload.environmentId),
  occurrence: (payload) => [payload.environmentId],
  payload: Environment.Change,
});

export * as EnvironmentFacts from "./facts.ts";
