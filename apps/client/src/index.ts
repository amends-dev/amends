export { ClientProvider, type ClientProviderProps } from "./provider.tsx";
export {
  AppearanceProvider,
  useAppearance,
  type AppearancePreference,
  type AppearanceSource,
  type AppearanceScope,
  type SystemAppearance,
} from "./appearance/provider.tsx";
export { useApiClient } from "./api/context.tsx";
export { Session } from "./api/contracts.ts";
export { useSession, type SessionScope } from "./session/provider.tsx";
export {
  DirectoryProvider,
  useDirectory,
  useWorkspace,
  type DirectoryState,
  type DirectoryScope,
} from "./session/directory.tsx";
export { paths, returnPath, signInPath, type WorkspacePage } from "./routing/paths.ts";
export { resolveApiBaseUrl } from "./configuration.ts";
export { createBrowserSessionStore, type SessionStore } from "./session/store.ts";
export { useSignIn, type SignInController, type SignInState } from "./sign-in/controller.ts";
export {
  useCreateWorkspace,
  type CreateWorkspaceController,
  type CreateWorkspaceState,
} from "./workspaces/create.ts";
export {
  useSettings,
  type SettingsChange,
  type SettingsController,
  type SettingsError,
  type SettingsOptions,
} from "./settings/controller.ts";
export {
  useWorkspaceSettings,
  type MemberFilter,
  type SettingsAccess,
  type SettingsAction,
  type SettingsDone,
  type SettingsFailure,
  type SettingsInvitation,
  type SettingsInvitationStatus,
  type SettingsMember,
  type SettingsPerson,
  type SettingsRole,
  type WorkspaceSettingsView,
} from "./settings/views.ts";
export type { WorkspaceFailure } from "./api/failures.ts";
export {
  useConnectionList,
  useConnections,
  type ConnectionAction,
  type ConnectionCapability,
  type ConnectionEntry,
  type ConnectionListEntry,
  type ConnectionMethod,
  type ConnectionProvider,
  type ConnectionSetting,
  type ConnectionSetup,
  type ConnectionsDone,
  type ConnectionsError,
  type ConnectionsFailure,
  type ConnectionsView,
} from "./connections/views.ts";
export {
  useEnvironmentList,
  useEnvironments,
  type CreateStep,
  type EnvironmentAction,
  type EnvironmentEntry,
  type EnvironmentIssue,
  type EnvironmentListEntry,
  type EnvironmentsDone,
  type EnvironmentsError,
  type EnvironmentsFailure,
  type EnvironmentsView,
  type HarnessChoice,
  type Placement,
  type SandboxAccount,
  type SandboxEditor,
  type SandboxProviderChoice,
} from "./environments/views.ts";
export type { CommandRow, Retention, SandboxDraft, VariableRow } from "./environments/draft.ts";
export type { EnvironmentProblem, SandboxIssue } from "./api/environments.ts";
export {
  useAgentList,
  useAgents,
  type AgentAction,
  type AgentBlocker,
  type AgentDraft,
  type AgentEntry,
  type AgentIssue,
  type AgentListEntry,
  type AgentRole,
  type AgentsDone,
  type AgentsError,
  type AgentsFailure,
  type AgentsView,
  type ConfigurationEditor,
  type EnvironmentFit,
  type EnvironmentOption,
  type ModelConnection,
} from "./agents/views.ts";
export type { AgentProblem, AgentReason } from "./api/agents.ts";
export {
  type SettingsData,
  type SettingsSection,
  type SettingsCommand,
  invitationIntent,
} from "./api/settings.ts";
export {
  useWorkspacePicker,
  useWorkspaceAccess,
  type AcceptAttempt,
  type AcceptInvitationError,
  type InvitationEntry,
  type WorkspaceAccess,
  type WorkspaceEntry,
  type WorkspacePickerController,
} from "./workspaces/picker.ts";
export {
  WorkspaceFeedProvider,
  useWorkspaceFeed,
  type WorkspaceFeedScope,
} from "./live/workspace-feed.tsx";
export type { WorkspaceFeedState } from "./api/changes.ts";
export { useLiveStatus, liveGrace } from "./live/status.ts";
export {
  useGroups,
  useGroupRoster,
  usePublicGroups,
  useMembers,
  useGroupStream,
  useThreadTimeline,
  useInbox,
  useInboxPending,
  useWorkspacePermission,
  type Read,
  type Members,
  type PagedView,
} from "./conversations/reads.ts";
export type {
  Group,
  GroupMembership,
  InboxFilter,
  Member,
  Notification,
  NotificationInbox,
  Thread,
  ThreadTimeline,
} from "./api/conversations.ts";
export { toDate } from "./conversations/time.ts";
export {
  memberName,
  useDirectMessages,
  useGroupConversation,
  useGroupPeople,
  useMentionCandidates,
  usePeople,
  useThreadConversation,
  useWorkspaceGroups,
  useWorkspacePeople,
  type Author,
  type ConversationStatus,
  type DirectEntry,
  type GroupEntry,
  type MentionCandidate,
  type MentionedMember,
  type ParticipationChange,
  type RosterEntry,
  type StreamEntry,
  type ThreadEntry,
  type ThreadMessageEntry,
  type ThreadNoteEntry,
} from "./conversations/views.ts";
export { useInboxView, type InboxEntry, type NotificationReason } from "./conversations/inbox.ts";
export {
  useNewThread,
  useDirectMessage,
  useReply,
  type ComposerController,
} from "./conversations/compose.ts";
export { usePageVisible, useMarkThreadRead, useMarkGroupRead } from "./conversations/read.ts";
export { useTyping } from "./conversations/typing.ts";
export {
  useThreadFollow,
  useGroupFollow,
  type FollowController,
  type FollowEvents,
} from "./conversations/follow.ts";
export {
  useMarkSeen,
  useMarkAllSeen,
  type SeenController,
  type SeenAllController,
} from "./conversations/seen.ts";
export {
  useCreateGroup,
  useJoinGroup,
  type CreateGroupController,
  type JoinGroupController,
} from "./conversations/groups.ts";
export { useGroupMembers, type GroupMembersController } from "./conversations/members.ts";
export { useRenameGroup, type RenameGroupController } from "./conversations/rename.ts";
export { useMemberName, type MemberNameController } from "./workspaces/member-name.ts";
export { suggestedName } from "./api/workspaces.ts";
export {
  activeState,
  useThreadTurns,
  useTurnActivity,
  useTurnLog,
  type ActiveTurn,
  type ThreadTurnsView,
  type TurnActivity,
  type TurnActivityView,
  type TurnCommandProblem,
  type TurnControls,
  type TurnDetail,
  type TurnEntry,
  type TurnLogView,
  type TurnState,
} from "./turns/views.ts";
