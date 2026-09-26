import { expect, it } from "@effect/vitest";
import { fileURLToPath } from "node:url";
import { ChangeFeedEvents } from "../../src/change-feed/events.ts";
import type { Fact } from "../../src/journal/fact.ts";

const isFact = (value: unknown): value is Fact.Definition =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Fact.Definition).name === "string" &&
  typeof (value as Fact.Definition).version === "number" &&
  typeof (value as Fact.Definition).subject === "function";

it("the change feed delivers every fact with an audience, and only those", async () => {
  const source = fileURLToPath(new URL("../../src", import.meta.url));
  const facts: Array<Fact.Definition> = [];
  for await (const path of new Bun.Glob("**/facts.ts").scan({ cwd: source }))
    for (const value of Object.values(await import(`${source}/${path}`)))
      if (isFact(value)) facts.push(value);
  expect(facts.length).toBeGreaterThan(20);
  // A fact with an audience is meant for readers, so a missing registration would leave them
  // stale; one without stays within the host.
  const misfiled = facts
    .filter((fact) => (fact.audience !== undefined) !== ChangeFeedEvents.delivers(fact))
    .map((fact) => `${fact.name}@${fact.version}`);
  expect(misfiled).toEqual([]);
});
