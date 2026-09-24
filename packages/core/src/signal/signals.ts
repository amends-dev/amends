import { Context } from "effect";
import type { Effect, Scope, Stream } from "effect";
import type { WorkspaceId } from "../workspace/id.ts";
import type { Signal } from "./signal.ts";

/**
 * One workspace's signals, across every process sharing the host's hub. Hosts supply it, bound to
 * the workspace; it holds nothing durable and takes no part in the journal or its write order.
 */
export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  /**
   * Offer a signal to the workspace's current subscribers, best effort: it never fails the caller,
   * and a subscriber too slow to keep up, or disconnected, misses it.
   */
  readonly publish: (signal: Signal.Value) => Effect.Effect<void>;
  /** The signals published after this registers, until the scope closes. */
  readonly subscribe: Effect.Effect<Stream.Stream<Signal.Value>, never, Scope.Scope>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/signal/signals/Service",
) {}

export * as Signals from "./signals.ts";
