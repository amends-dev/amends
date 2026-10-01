import { Context, Effect } from "effect";
import type { DateTime } from "effect";
import type { Reaction } from "../journal/reaction.ts";
import { Store } from "../journal/store.ts";

import type { BackgroundProcess } from "./process.ts";

/**
 * Requests for one workspace's background processes to run. Hosts supply it, bound to the
 * workspace, and deliver each request to whichever process runs that workspace's background work.
 */
export interface Interface {
  /**
   * Ask for a process to run, now or at `at`, as part of the caller's commit: the request is
   * stored with the commit and discarded if it rolls back. Asking again in the same commit for
   * the same process and time asks once.
   */
  readonly request: (
    process: BackgroundProcess.Name,
    options?: { readonly at?: DateTime.Utc | undefined },
  ) => Effect.Effect<void, Store.Failure, Store.Transaction>;
}
/** @effect-expect-leaking Transaction */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/background/wakes/Service",
) {}

/**
 * The journal reactions that wake each process when a commit publishes a fact it wakes on, once
 * per process however many such facts the commit publishes.
 */
export const reactions = (
  processes: ReadonlyArray<
    Pick<BackgroundProcess.Definition<unknown, unknown>, "name" | "wakesOn">
  >,
): ReadonlyArray<Reaction.Definition<Service>> => {
  const requested = new WeakMap<object, Set<BackgroundProcess.Name>>();
  return processes.flatMap((process) =>
    process.wakesOn.map((trigger): Reaction.Definition<Service> => ({
      fact: trigger.fact,
      react: Effect.fnUntraced(function* (event) {
        if (!trigger.when(event.payload)) return;
        const commit = yield* Store.Transaction;
        const woken = requested.get(commit) ?? new Set();
        if (woken.has(process.name)) return;
        yield* (yield* Service).request(process.name);
        woken.add(process.name);
        requested.set(commit, woken);
      }),
    })),
  );
};

export * as BackgroundWakes from "./wakes.ts";
