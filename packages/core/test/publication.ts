import { Crypto, DateTime, Effect } from "effect";
import * as Performer from "../src/identity/performer.ts";
import * as Event from "../src/journal/event.ts";
import * as WorkspaceId from "../src/workspace/id.ts";

/** Explicit attribution for low-level fixture publications that bypass application operations. */
export const testProvenance = (
  workspaceId = WorkspaceId.Id.make("workspace-one"),
): Event.Provenance => ({
  workspaceId,
  performedBy: { _tag: "System", id: Performer.SystemId.make("test-fixture") },
  causedBy: null,
  correlationId: Event.CorrelationId.make("test-operation"),
  occurredAt: DateTime.makeUnsafe("2026-09-20T12:00:00.000Z"),
});

export const testCrypto = Crypto.make({
  randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
  digest: () => Effect.die("Unexpected digest in publication tests"),
});
