/**
 * The conformance suites. Each registers its tests for one harness; an adapter's test
 * files call the suites it runs.
 */
export { agents } from "./agents.ts";
export { assignments } from "./assignments.ts";
export { authorization } from "./authorization.ts";
export { builtinRoles } from "./builtin-roles.ts";
export { changeFeed } from "./change-feed.ts";
export { connections } from "./connections.ts";
export { contracts } from "./contracts.ts";
export { environments } from "./environments.ts";
export { factMetadata } from "./fact-metadata.ts";
export { gateway } from "./gateway.ts";
export { groupFollows } from "./group-follows.ts";
export { groupMemberships } from "./group-memberships.ts";
export { groupReads } from "./group-reads.ts";
export { groups } from "./groups.ts";
export { idempotency } from "./idempotency.ts";
export { invitationPolicy } from "./invitation-policy.ts";
export { invitationReplay } from "./invitation-replay.ts";
export { invitations } from "./invitations.ts";
export { journal } from "./journal.ts";
export { notificationAcknowledgment } from "./notification-acknowledgment.ts";
export { notificationSources } from "./notification-sources.ts";
export { notifications } from "./notifications.ts";
export { ownership } from "./ownership.ts";
export { provenance } from "./provenance.ts";
export { readState } from "./read-state.ts";
export { reads } from "./reads.ts";
export { requests } from "./requests.ts";
export { signals } from "./signals.ts";
export { standaloneAppends } from "./standalone-appends.ts";
export { threadParticipation } from "./thread-participation.ts";
export { threadReads } from "./thread-reads.ts";
export { threadReplies } from "./thread-replies.ts";
export { threadStarts } from "./thread-starts.ts";
export { threads } from "./threads.ts";
export { transactions } from "./transactions.ts";

export * as Suites from "./suites.ts";
export { workspaceSettings } from "./workspace-settings.ts";
