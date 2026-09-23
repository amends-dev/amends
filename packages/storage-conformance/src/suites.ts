/**
 * The conformance suites. Each registers its tests for one harness; an adapter's test
 * files call the suites it runs.
 */
export { assignments } from "./assignments.ts";
export { authorization } from "./authorization.ts";
export { commitPublication } from "./commit-publication.ts";
export { contracts } from "./contracts.ts";
export { factMetadata } from "./fact-metadata.ts";
export { gateway } from "./gateway.ts";
export { idempotency } from "./idempotency.ts";
export { invitationPolicy } from "./invitation-policy.ts";
export { invitationReplay } from "./invitation-replay.ts";
export { invitations } from "./invitations.ts";
export { journal } from "./journal.ts";
export { ownership } from "./ownership.ts";
export { provenance } from "./provenance.ts";
export { reads } from "./reads.ts";
export { transactions } from "./transactions.ts";

export * as Suites from "./suites.ts";
