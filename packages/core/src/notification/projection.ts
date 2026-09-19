import { Projection } from "../journal/projection.ts";

/**
 * Registration point for notification generation. No source facts are handled
 * yet. This projection still checkpoints examined entries; adding historical
 * generation later requires fresh development data or explicit projection preparation.
 */
export const definition = Projection.make("notifications", { version: 1 });

export * as NotificationProjection from "./projection.ts";
