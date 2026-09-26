import type { WorkspaceFailure } from "@amends/client";
import { createEffect, createMemo, createSignal, on, type Accessor } from "solid-js";

/**
 * Whether a live read lost its access: a refresh answered that what it reads is gone or denied,
 * and nothing has loaded since. Its last value stays in the read, so a view that keeps showing it
 * would show what the reader may no longer see; this says to stop. A later success clears it.
 */
export function lostAccess(read: {
  readonly value: Accessor<unknown>;
  readonly failure: Accessor<WorkspaceFailure | undefined>;
}): Accessor<"gone" | "denied" | undefined> {
  const [lost, setLost] = createSignal<"gone" | "denied">();
  // A read keeps its last success through refreshes and failures, so only a different value
  // means a refresh succeeded.
  const value = createMemo(() => read.value());
  createEffect(on(value, () => setLost(undefined), { defer: true }));
  createEffect(() => {
    const failure = read.failure();
    if (failure === "gone" || failure === "denied") setLost(failure);
  });
  return lost;
}
