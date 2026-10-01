import { Context, Crypto, Effect, Layer, Schema } from "effect";
import { Performer } from "../identity/performer.ts";
import { Publication } from "../journal/publication.ts";
import { Transaction } from "../journal/transaction.ts";

import { BackgroundProcess } from "./process.ts";

/** No process of this name is registered, as when a newer host asked for it. */
export class Unknown extends Schema.TaggedError<Unknown>()("BackgroundRuns.Unknown", {
  process: Schema.String,
}) {}
/** The process failed; what it committed before failing stays, and a later run carries on. */
export class Failure extends Schema.TaggedError<Failure>()("BackgroundRuns.Failure", {
  process: Schema.String,
  cause: Schema.Defect(),
}) {}
/** Two processes share a name. */
export class Duplicate extends Schema.TaggedError<Duplicate>()("BackgroundRuns.Duplicate", {
  process: Schema.String,
}) {}

export interface Interface {
  readonly names: ReadonlyArray<BackgroundProcess.Name>;
  /**
   * Run a registered process once in this workspace, attributed to it as a system performer,
   * and report what it left outstanding. Whoever runs a workspace's background work calls this,
   * one run of a process at a time.
   */
  readonly run: (process: string) => Effect.Effect<BackgroundProcess.Outcome, Unknown | Failure>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/background/runs/Service",
) {}

/** @category constructors */
export const make = Effect.fn("BackgroundRuns.make")(function* <E, R>(
  processes: ReadonlyArray<BackgroundProcess.Definition<E, R>>,
) {
  const { workspaceId } = yield* Transaction.Service;
  const crypto = yield* Crypto.Crypto;
  // Each run supplies its own attribution; everything else a process uses is bound here.
  const services = yield* Effect.context<Exclude<R, Publication.Service>>();
  const byName = new Map<string, BackgroundProcess.Definition<E, R>>();
  for (const process of processes) {
    if (byName.has(process.name)) return yield* new Duplicate({ process: process.name });
    byName.set(process.name, process);
  }
  const run = Effect.fn("BackgroundRuns.run")(function* (name: string) {
    const process = byName.get(name);
    if (process === undefined) return yield* new Unknown({ process: name });
    const provenance = yield* Publication.make(
      workspaceId,
      Performer.Reference.cases.System.make({ id: Performer.SystemId.make(process.name) }),
    ).pipe(Effect.provideService(Crypto.Crypto, crypto), Effect.orDie);
    return yield* process.run.pipe(
      Effect.provideService(Publication.Service, provenance),
      Effect.updateContext((current: Context.Context<never>) => Context.merge(services, current)),
      Effect.mapError((cause) => new Failure({ process: process.name, cause })),
    );
  });
  return Service.of({ names: processes.map((process) => process.name), run });
});

/** Register the domains' processes, built over the services they use. @category layers */
export const layer = <E, R>(processes: ReadonlyArray<BackgroundProcess.Definition<E, R>>) =>
  Layer.effect(Service, make(processes));

export * as BackgroundRuns from "./runs.ts";
