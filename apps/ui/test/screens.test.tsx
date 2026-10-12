import { afterEach, describe, it, vi } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.tsx";
import conversationMeta, {
  Composing,
  FormattedText,
  Messages,
  ProfileCards,
  TaskStates,
} from "../src/components/conversation.stories.tsx";
import groupMeta, {
  Commands,
  Reply,
  Send,
  ThreadOpen,
  Threads,
} from "../src/screens/group/group.stories.tsx";
import tasksMeta, {
  AllTasks,
  FilterAndOpen,
  TaskOpen,
} from "../src/screens/group/tasks.stories.tsx";
import navigationMeta, {
  GroupsLoading,
  Home as NavigationHome,
  NoGroups,
} from "../src/screens/workspace-navigation/workspace-navigation.stories.tsx";
import settingsMeta, {
  AddMembers,
  General,
  Members,
  Rename,
  WorkspaceGeneral,
} from "../src/screens/group/settings.stories.tsx";
import formsMeta, {
  Buttons,
  CardsAndDetailedSelect,
  Fields,
  Notices,
  SettingsFields,
  SuggestionsAndStatuses,
} from "../src/components/forms.stories.tsx";
import connectionsMeta, {
  AddConnectionFlow,
  AllConnections,
  ChooseIntegration,
  ChooseToolIntegration,
  ConfigureMcpServer,
  ConfigureWithoutAuthentication,
  ConnectionPage,
  EmptyConnections,
  IntegrationNotInstalled,
  KeyRefused,
  KeyStorageUnavailable,
  LoadFailed as ConnectionsLoadFailed,
  Loading as ConnectionsLoading,
  NoMatchingConnections,
  ReadOnly as ConnectionsReadOnly,
  RemoveConnection,
  RenamedMeanwhile as ConnectionRenamedMeanwhile,
  ReplaceKey as ConnectionReplaceKey,
  SetupRefused,
  ToolConnections,
} from "../src/screens/connections/connections.stories.tsx";
import agentsMeta, {
  AddAgentFlow,
  AgentAtWork,
  AgentIdle,
  AgentPage,
  AgentsAtWork,
  AllAgents,
  AutoWithoutHarness,
  ConnectionUnavailable as AgentConnectionUnavailable,
  EmptyAgents,
  HarnessNeedsSandbox,
  IntegrationNotInstalled as AgentIntegrationNotInstalled,
  ListedModels,
  LoadFailed as AgentsLoadFailed,
  Loading as AgentsLoading,
  ModelWithoutEffort,
  ModelsFailed,
  ModelsLoading,
  NeedsSetup as AgentsNeedsSetup,
  NoMatchingAgents,
  ReadOnly as AgentsReadOnly,
  RemoveAgent,
  RenamedMeanwhile as AgentRenamedMeanwhile,
  RoleOptions as AgentRoleOptions,
  SandboxRemoved,
  Unavailable as AgentsUnavailable,
} from "../src/screens/agents/agents.stories.tsx";
import createMeta, { CreateAndOpen, OpenForm } from "../src/screens/group/create.stories.tsx";
import directoryMeta, {
  Discover,
  JoinFromDiscover,
  PreviewAndJoin,
  PreviewPublicGroup,
  ReadPublicThread,
  YourGroups,
} from "../src/screens/groups/directory.stories.tsx";
import signInMeta, {
  Code,
  CodeError,
  Email,
  EmailLimited,
  Resend,
  SignInFlow,
  WithProviders,
} from "../src/screens/sign-in/sign-in.stories.tsx";
import dialogsMeta, {
  ChangeNameFailed,
  ChangeYourName,
  JumpToAnywhere,
  NewMessageDialog,
} from "../src/screens/account/dialogs.stories.tsx";
import conversationMeta2, {
  AccountMenu,
  EarlierFailed,
  Failed,
  Follow,
  Loading,
  Mentions,
  OpenThread,
  ReplyInThread,
  Stream,
  Unavailable,
} from "../src/screens/group/conversation.stories.tsx";
import inboxMeta, {
  AllActivity,
  CaughtUp,
  FirstUse,
  Loading as InboxLoading,
  MarkAllSeen,
  SelectionFlow,
  UnreadWithThread,
} from "../src/screens/inbox/inbox.stories.tsx";
import settingsScreenMeta, {
  ChangeRole,
  ConfirmRemove,
  ConfirmRevoke,
  ConfirmTransfer,
  InvitationHistory,
  InviteFlow,
  InviteMember,
  Loading as SettingsLoading,
  MemberDetailsOpen,
  Members as SettingsMembers,
  ReadOnly,
  RemoveMember,
  RevokeFromHistory,
  StaleRename,
  TransferFlow,
  Workspace as SettingsWorkspaceStory,
} from "../src/screens/settings/settings.stories.tsx";
import standaloneMeta, {
  CheckingSession,
  Crashed,
  HostUnavailable,
  NotFound,
  WorkspaceInvited,
  WorkspaceRemoved,
  WorkspaceUnknown,
} from "../src/screens/standalone/standalone.stories.tsx";
import workspacesMeta, {
  AcceptFailure,
  AcceptInvitation,
  CreatedRefreshFailed,
  CreateFirstWorkspace,
  CreateWorkspace,
  FirstWorkspace,
  InvitationsOnly,
  RefreshFailed,
  WorkspacesAndInvitations,
} from "../src/screens/workspaces/workspaces.stories.tsx";
import turnsMeta, {
  CompletedWithoutReply,
  FailedWithRetry,
  FollowOnly,
  LogCompleted,
  LogFailed,
  LogQueued,
  LogReconnecting,
  LogStreaming,
  Queued as TurnQueued,
  Replied,
  StopFailed,
  Stopped as TurnStopped,
  StoppedWhenAgentLeft,
  Stopping as TurnStopping,
  Working as TurnWorking,
} from "../src/screens/turns/turns.stories.tsx";
import { viewport } from "./viewport.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("conversation components", () => {
  const stories = definePreview(preview).meta(conversationMeta);
  it("renders messages and task states", async () => {
    await stories.story(Messages).run();
    await stories.story(TaskStates).run();
  });
  it("sends with Enter, keeps Shift+Enter lines, and refuses blank drafts", async () => {
    await stories.story(Composing).run();
  });
  it("formats markdown messages, a streaming draft, and a one-line preview", async () => {
    await stories.story(FormattedText).run();
  });
  it("opens a member's card from their name or a mention, with what the reader can do", async () => {
    await stories.story(ProfileCards).run();
  });
});

describe("group threads screen", () => {
  const stories = definePreview(preview).meta(groupMeta);
  it("renders with and without the open thread", async () => {
    viewport(1600);
    await stories.story(Threads).run();
    await stories.story(ThreadOpen).run();
  });
  it("opens a thread from its replies, replies, and closes it", async () => {
    viewport(1600);
    await stories.story(Reply).run();
  });
  it("sends to the group and toggles a reaction", async () => {
    viewport(1600);
    await stories.story(Send).run();
  });
  it("runs commands typed after / in place of posting them", async () => {
    viewport(1600);
    await stories.story(Commands).run();
  });
});

describe("turns screens", () => {
  const stories = definePreview(preview).meta(turnsMeta);
  it("shows an agent's turn under its thread, in every state, with Stop and Retry", async () => {
    viewport(1600);
    await stories.story(TurnQueued).run();
    await stories.story(TurnWorking).run();
    await stories.story(TurnStopping).run();
    await stories.story(TurnStopped).run();
    await stories.story(FailedWithRetry).run();
    await stories.story(StoppedWhenAgentLeft).run();
    await stories.story(CompletedWithoutReply).run();
    await stories.story(FollowOnly).run();
    await stories.story(StopFailed).run();
  });
  it("opens a reply's turn log, and shows the log's states", async () => {
    viewport(1600);
    await stories.story(Replied).run();
    await stories.story(LogQueued).run();
    await stories.story(LogStreaming).run();
    await stories.story(LogReconnecting).run();
    await stories.story(LogFailed).run();
    await stories.story(LogCompleted).run();
  });
});

describe("group tasks screen", () => {
  const stories = definePreview(preview).meta(tasksMeta);
  it("renders the list and an open task", async () => {
    viewport(1600);
    await stories.story(AllTasks).run();
    await stories.story(TaskOpen).run();
  });
  it("searches, filters by status, and opens a task", async () => {
    viewport(1600);
    await stories.story(FilterAndOpen).run();
  });
});

describe("group settings modal", () => {
  const stories = definePreview(preview).meta(settingsMeta);
  it("renders the general and members tabs", async () => {
    viewport(1600);
    await stories.story(General).run();
    await stories.story(Members).run();
  });
  it("offers no Leave, adding, or removing in the workspace's general group", async () => {
    viewport(1600);
    await stories.story(WorkspaceGeneral).run();
  });
  it("saves a new name and visibility only when changed and named", async () => {
    viewport(1600);
    await stories.story(Rename).run();
  });
  it("chooses members by keyboard and pointer and adds them", async () => {
    viewport(1600);
    await stories.story(AddMembers).run();
  });
});

describe("form components", () => {
  const stories = definePreview(preview).meta(formsMeta);
  it("renders buttons", async () => {
    await stories.story(Buttons).run();
  });
  it("associates help and errors, switches choices, and picks members", async () => {
    await stories.story(Fields).run();
  });
  it("announces a caution notice", async () => {
    await stories.story(Notices).run();
  });
  it("chooses among cards, and offers an action after a select's detailed options", async () => {
    await stories.story(CardsAndDetailedSelect).run();
  });
  it("suggests models, keeps any entered one, and shows each option's status", async () => {
    await stories.story(SuggestionsAndStatuses).run();
  });
  it("draws fields from their description and says what each refuses", async () => {
    await stories.story(SettingsFields).run();
  });
});

describe("connections screen", () => {
  const stories = definePreview(preview).meta(connectionsMeta);
  it("renders the list, a connection's page, the dialogs, and states", async () => {
    viewport(1600);
    for (const story of [
      ConnectionPage,
      ChooseToolIntegration,
      ConfigureMcpServer,
      ConfigureWithoutAuthentication,
      ConnectionReplaceKey,
      RemoveConnection,
      EmptyConnections,
      ConnectionsLoading,
      ConnectionsLoadFailed,
    ]) {
      await stories.story(story).run();
      cleanup();
    }
  });
  it("lists every kind in the sidebar, and a connection whose integration is gone only in the list", async () => {
    viewport(1600);
    await stories.story(AllConnections).run();
    cleanup();
    await stories.story(ToolConnections).run();
  });
  it("adds a connection with its key in one step, then checks it", async () => {
    viewport(1600);
    await stories.story(AddConnectionFlow).run();
  });
  it("narrows the integrations by a search", async () => {
    viewport(1600);
    await stories.story(ChooseIntegration).run();
  });
  it("says what a check found, and why an integration refuses a setup", async () => {
    viewport(1600);
    await stories.story(KeyRefused).run();
    cleanup();
    await stories.story(SetupRefused).run();
  });
  it("offers only removal for a connection whose integration is gone", async () => {
    viewport(1600);
    await stories.story(IntegrationNotInstalled).run();
  });
  it("keeps the draft when the host keeps no keys", async () => {
    viewport(1600);
    await stories.story(KeyStorageUnavailable).run();
  });
  it("shows members connections without any action", async () => {
    viewport(1600);
    await stories.story(ConnectionsReadOnly).run();
  });
  it("offers to clear a search that finds nothing, and keeps a draft name renamed meanwhile", async () => {
    viewport(1600);
    await stories.story(NoMatchingConnections).run();
    cleanup();
    await stories.story(ConnectionRenamedMeanwhile).run();
  });
});

describe("agents screen", () => {
  const stories = definePreview(preview).meta(agentsMeta);
  it("renders the list, an agent's page, the dialogs, and states", async () => {
    viewport(1600);
    for (const story of [
      AgentPage,
      AgentIntegrationNotInstalled,
      AutoWithoutHarness,
      EmptyAgents,
      AgentsLoading,
      AgentsLoadFailed,
      AgentsUnavailable,
    ]) {
      await stories.story(story).run();
      cleanup();
    }
  });
  it("lists every agent with its harness and model, and those that need setup", async () => {
    viewport(1600);
    await stories.story(AllAgents).run();
    cleanup();
    await stories.story(AgentsNeedsSetup).run();
  });
  it("shows where agents are at work, each turn on an agent's page opening its log", async () => {
    viewport(1600);
    await stories.story(AgentsAtWork).run();
    cleanup();
    await stories.story(AgentAtWork).run();
    cleanup();
    await stories.story(AgentIdle).run();
  });
  it("adds an agent, offering only the roles the reader may give", async () => {
    viewport(1600);
    await stories.story(AddAgentFlow).run();
    cleanup();
    await stories.story(AgentRoleOptions).run();
  });
  it("says why an agent can't run, and saves a setup that can", async () => {
    viewport(1600);
    await stories.story(SandboxRemoved).run();
    cleanup();
    await stories.story(HarnessNeedsSandbox).run();
  });
  it("suggests a connection's models and the efforts each takes", async () => {
    viewport(1600);
    await stories.story(ListedModels).run();
    cleanup();
    await stories.story(ModelWithoutEffort).run();
    cleanup();
    await stories.story(ModelsLoading).run();
    cleanup();
    await stories.story(ModelsFailed).run();
  });
  it("keeps the draft when the host refuses a connection, and removes an agent", async () => {
    viewport(1600);
    await stories.story(AgentConnectionUnavailable).run();
    cleanup();
    await stories.story(RemoveAgent).run();
  });
  it("shows members agents without any action, and keeps a draft name renamed meanwhile", async () => {
    viewport(1600);
    await stories.story(AgentsReadOnly).run();
    cleanup();
    await stories.story(NoMatchingAgents).run();
    cleanup();
    await stories.story(AgentRenamedMeanwhile).run();
  });
});

describe("create group", () => {
  const stories = definePreview(preview).meta(createMeta);
  it("renders the form", async () => {
    viewport(1600);
    await stories.story(OpenForm).run();
  });
  it("creates a public group with members and opens its welcome", async () => {
    viewport(1600);
    await stories.story(CreateAndOpen).run();
  });
});

describe("browse groups", () => {
  const stories = definePreview(preview).meta(directoryMeta);
  it("renders the directory tabs and a preview", async () => {
    viewport(1600);
    await stories.story(YourGroups).run();
    await stories.story(Discover).run();
    await stories.story(PreviewPublicGroup).run();
    await stories.story(ReadPublicThread).run();
  });
  it("previews a public group, reads a thread, and joins", async () => {
    viewport(1600);
    await stories.story(PreviewAndJoin).run();
  });
  it("joins from Discover and opens the group from the toast", async () => {
    viewport(1600);
    await stories.story(JoinFromDiscover).run();
  });
});

describe("sign in", () => {
  const stories = definePreview(preview).meta(signInMeta);
  it("renders the email, code, error, and provider layouts", async () => {
    await stories.story(Email).run();
    await stories.story(Code).run();
    await stories.story(CodeError).run();
    await stories.story(WithProviders).run();
  });
  it("validates the email, refuses a wrong code, and continues with the right one", async () => {
    await stories.story(SignInFlow).run();
  });
  it("announces a new code and clears the field", async () => {
    await stories.story(Resend).run();
  });
  it("says when too many codes were requested", async () => {
    await stories.story(EmailLimited).run();
  });
});

describe("workspace picker", () => {
  const stories = definePreview(preview).meta(workspacesMeta);
  it("renders workspaces, invitations only, the first workspace, and creation", async () => {
    await stories.story(WorkspacesAndInvitations).run();
    await stories.story(InvitationsOnly).run();
    await stories.story(FirstWorkspace).run();
    await stories.story(CreateWorkspace).run();
    await stories.story(RefreshFailed).run();
    await stories.story(CreatedRefreshFailed).run();
  });
  it("accepts an invitation under a chosen name", async () => {
    await stories.story(AcceptInvitation).run();
  });
  it("keeps the Join dialog open with the reason when accepting fails", async () => {
    await stories.story(AcceptFailure).run();
  });
  it("creates a first workspace", async () => {
    await stories.story(CreateFirstWorkspace).run();
  });
});

describe("standalone screens", () => {
  const stories = definePreview(preview).meta(standaloneMeta);
  it("renders the session, host, not-found, crash, and workspace access states", async () => {
    await stories.story(CheckingSession).run();
    await stories.story(HostUnavailable).run();
    await stories.story(NotFound).run();
    await stories.story(Crashed).run();
    await stories.story(WorkspaceInvited).run();
    await stories.story(WorkspaceRemoved).run();
    await stories.story(WorkspaceUnknown).run();
  });
});

describe("live conversation", () => {
  const stories = definePreview(preview).meta(conversationMeta2);
  it("renders day seams, reply summaries, notes, typing, and states", async () => {
    await stories.story(Stream).run();
    await stories.story(OpenThread).run();
    await stories.story(Loading).run();
    await stories.story(Unavailable).run();
    await stories.story(Failed).run();
    await stories.story(EarlierFailed).run();
  });
  it("replies in a thread with no replies yet", async () => {
    await stories.story(ReplyInThread).run();
  });
  it("suggests people after @ and sends the mention", async () => {
    await stories.story(Mentions).run();
  });
  it("follows the group and opens the account menu", async () => {
    await stories.story(Follow).run();
    await stories.story(AccountMenu).run();
  });
});

describe("workspace dialogs", () => {
  const stories = definePreview(preview).meta(dialogsMeta);
  it("changes a name and chooses people to message", async () => {
    await stories.story(ChangeYourName).run();
    await stories.story(ChangeNameFailed).run();
    await stories.story(NewMessageDialog).run();
  });
  it("jumps anywhere by name from the keyboard", async () => {
    await stories.story(JumpToAnywhere).run();
  });
});

describe("inbox", () => {
  const stories = definePreview(preview).meta(inboxMeta);
  it("renders all activity, unread with a thread, caught up, first use, and loading", async () => {
    await stories.story(AllActivity).run();
    await stories.story(UnreadWithThread).run();
    await stories.story(CaughtUp).run();
    await stories.story(FirstUse).run();
    await stories.story(InboxLoading).run();
  });
  it("keeps the open row in Unread until another opens or it closes", async () => {
    await stories.story(SelectionFlow).run();
  });
  it("marks all seen", async () => {
    await stories.story(MarkAllSeen).run();
  });
});

describe("workspace settings", () => {
  const stories = definePreview(preview).meta(settingsScreenMeta);
  it("renders the workspace, members, details, dialogs, and loading", async () => {
    await stories.story(SettingsWorkspaceStory).run();
    await stories.story(SettingsMembers).run();
    await stories.story(MemberDetailsOpen).run();
    await stories.story(InviteMember).run();
    await stories.story(InvitationHistory).run();
    await stories.story(ConfirmTransfer).run();
    await stories.story(ConfirmRemove).run();
    await stories.story(ConfirmRevoke).run();
    await stories.story(SettingsLoading).run();
  });
  it("offers nothing to change to a reader who may only look", async () => {
    await stories.story(ReadOnly).run();
  });
  it("creates an invitation and marks it in Pending", async () => {
    await stories.story(InviteFlow).run();
  });
  it("changes a role, removes a member, revokes, and transfers ownership", async () => {
    await stories.story(ChangeRole).run();
    await stories.story(RemoveMember).run();
    await stories.story(RevokeFromHistory).run();
    await stories.story(TransferFlow).run();
  });
  it("keeps a stale draft through a refresh", async () => {
    await stories.story(StaleRename).run();
  });
});

describe("workspace navigation", () => {
  const stories = definePreview(preview).meta(navigationMeta);
  it("lists groups and direct messages, and says when there are no groups once they load", async () => {
    viewport(1600);
    await stories.story(NavigationHome).run();
    await stories.story(NoGroups).run();
    await stories.story(GroupsLoading).run();
  });
});
