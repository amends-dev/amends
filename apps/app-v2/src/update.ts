/**
 * How each message changes the app: signing in a step at a time, listing and opening workspaces,
 * following the open store, what the person does in its groups, threads and their tasks and turns,
 * settings, and connections, following a turn's log, and signing out. A message that comes when the page is past it, such as a code check finishing after the
 * person signed out, changes nothing.
 */

import type { Connection as ConnectionContract } from "@amends-dev/connection"
import { Assignment, BuiltinRoles } from "@amends-dev/core/authorization"
import { Notification, NotificationStore } from "@amends-dev/core/notification"
import { Task } from "@amends-dev/core/task"
import { ThreadMessage } from "@amends-dev/core/thread"
import { Turn } from "@amends-dev/core/turn"
import type * as SignIn from "@amends-dev/gateway/SignIn"
import type * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import type { Update } from "foldkit"
import type * as ManagedResource from "foldkit/managedResource"
import { modifyFields } from "foldkit/struct"
import type * as Browser from "./browser.ts"
import {
  AddConnection,
  CheckCode,
  CheckConnection,
  LoadIntegrations,
  LoadWorkspaces,
  ReplaceConnectionKey,
  SaveSession,
  SendCode,
  SignOut
} from "./command.ts"
import type { Flags } from "./flags.ts"
import { Message } from "./message.ts"
import {
  Check,
  ConnectionForm,
  type Connections,
  Composing,
  type Editing,
  type InboxItem,
  Integrations,
  LogState,
  type Model,
  type OpenGroup,
  type Opened,
  type OpenThread,
  Page,
  Pane,
  type Settings,
  SignInForm,
  StoreState,
  type TurnLog,
  Workspaces
} from "./model.ts"
import { workspaceRolesOf } from "./permissions.ts"
import * as SettingsForm from "./settingsForm.ts"
import {
  AddGroupMember,
  ChangeRole,
  ConfigureConnection,
  CreateTask,
  CreateTeam,
  DeleteMessage,
  Dismiss,
  EditMessage,
  FollowGroup,
  FollowThread,
  Invite,
  JoinGroup,
  LeaveGroup,
  MarkAllNotificationsSeen,
  MarkNotificationSeen,
  MarkThreadRead,
  PostReply,
  RemoveConnection,
  RemoveGroupMember,
  RemoveMember,
  RenameConnection,
  RenameGroup,
  RenameSelf,
  RenameThread,
  RenameWorkspace,
  RetryTurn,
  RevokeInvitation,
  StartDirect,
  StartThread,
  StopTurn,
  type StoreResource,
  TransferOwnership,
  UnfollowGroup,
  UnfollowThread,
  UpdateTask
} from "./store.ts"

export type UpdateReturn = Update.Return<
  Model,
  Message,
  Layer.Success<typeof Browser.layer> | ManagedResource.ServiceOf<typeof StoreResource>
>

type SignedIn = Extract<Page, { readonly _tag: "SignedIn" }>

/** Signed out, at an empty sign-in form, or one for `email`. */
const signedOut = (apiUrl: string, email: string): Model => ({
  apiUrl,
  page: Page.SignedOut({ form: SignInForm.EnteringEmail({ email, error: Option.none() }) })
})

/** Signed in as `session`, listing their workspaces. */
const signedIn = (apiUrl: string, session: SignIn.Session): UpdateReturn => ({
  model: { apiUrl, page: Page.SignedIn({ session, workspaces: Workspaces.Loading(), opened: Option.none() }) },
  commands: [LoadWorkspaces({ apiUrl, token: session.token })]
})

/** Start from the session kept from the last visit, or signed out. */
export const init = (flags: Flags): UpdateReturn =>
  Option.match(flags.session, {
    onNone: () => ({ model: signedOut(flags.apiUrl, "") }),
    onSome: (session) => signedIn(flags.apiUrl, session)
  })

/** The sign-in form as `step` makes it, while the person is signed out; otherwise nothing. */
const atForm = (
  model: Model,
  step: (form: SignInForm) => Readonly<{ form: SignInForm; commands?: UpdateReturn["commands"] }> | undefined
): UpdateReturn =>
  Page.matchOrElse(
    model.page,
    {
      SignedOut: ({ form }) => {
        const next = step(form)
        if (next === undefined) return { model }
        return { model: { ...model, page: Page.SignedOut({ form: next.form }) }, commands: next.commands ?? [] }
      }
    },
    () => ({ model })
  )

/** The signed-in page as `change` makes it, while the person is signed in; otherwise nothing. */
const atSignedIn = (model: Model, change: (page: SignedIn) => SignedIn): UpdateReturn =>
  Page.matchOrElse(model.page, { SignedIn: (page) => ({ model: { ...model, page: change(page) } }) }, () => ({
    model
  }))

/** The open workspace as `change` makes it, while one is open; otherwise nothing. */
const atOpened = (model: Model, change: (opened: Opened) => Opened): UpdateReturn =>
  atSignedIn(model, (page) => modifyFields(page, { opened: Option.map(change) }))

/** The open workspace's store as `change` makes it, while one is open; otherwise nothing. */
const atStore = (model: Model, change: (store: StoreState) => StoreState): UpdateReturn =>
  atOpened(model, (opened) => modifyFields(opened, { store: change }))

/** The open group as `change` makes it, while one is open; otherwise nothing. */
const atGroup = (model: Model, change: (group: OpenGroup) => OpenGroup): UpdateReturn =>
  atOpened(model, (opened) =>
    modifyFields(opened, {
      pane: Option.map(Pane.matchOrElse({ Group: ({ group }) => Pane.Group({ group: change(group) }) }, (pane) => pane))
    })
  )

/** The open settings as `change` makes them from the workspace, while they are open; otherwise nothing. */
const atSettings = (model: Model, change: (settings: Settings, opened: Opened) => Settings): UpdateReturn =>
  atOpened(model, (opened) =>
    modifyFields(opened, {
      pane: Option.map(
        Pane.matchOrElse(
          { Settings: ({ settings }) => Pane.Settings({ settings: change(settings, opened) }) },
          (pane) => pane
        )
      )
    })
  )

/** The open connections pane as `change` makes it from the workspace, while it is open; otherwise nothing. */
const atConnections = (model: Model, change: (connections: Connections, opened: Opened) => Connections): UpdateReturn =>
  atOpened(model, (opened) =>
    modifyFields(opened, {
      pane: Option.map(
        Pane.matchOrElse(
          { Connections: ({ connections }) => Pane.Connections({ connections: change(connections, opened) }) },
          (pane) => pane
        )
      )
    })
  )

/** The form open among the connections as `change` makes it, while one is open; otherwise nothing. */
const atConnectionForm = (model: Model, change: (form: ConnectionForm, opened: Opened) => ConnectionForm) =>
  atConnections(model, (connections, opened) =>
    modifyFields(connections, { form: Option.map((form) => change(form, opened)) })
  )

/** The open connections pane, and the workspace it is of, while it is open. */
const connectionsIn = (model: Model): Option.Option<{ readonly connections: Connections; readonly opened: Opened }> =>
  Option.flatMap(openedIn(model), (opened) =>
    Option.flatMap(
      opened.pane,
      Pane.matchOrElse({ Connections: ({ connections }) => Option.some({ connections, opened }) }, () => Option.none())
    )
  )

/** Whom a request acts as in the open workspace: the host, the person's session, and the workspace. */
const asMemberIn = (model: Model) =>
  Page.matchOrElse(
    model.page,
    {
      SignedIn: ({ session, opened }) =>
        Option.map(opened, ({ workspace }) => ({
          apiUrl: model.apiUrl,
          token: session.token,
          workspaceId: workspace.id
        }))
    },
    () => Option.none()
  )

/** The integration `integrationId`, once the host listed its integrations. */
const integrationOf = (opened: Opened, integrationId: string) =>
  Option.flatMap(
    opened.integrations,
    Integrations.matchOrElse(
      { Loaded: ({ integrations }) => Option.fromUndefinedOr(integrations.find(({ id }) => id === integrationId)) },
      () => Option.none()
    )
  )

/** The connection `connectionId`, and the integration it links to, once the host listed them. */
const connectionOf = (opened: Opened, connectionId: ConnectionContract.ConnectionId) =>
  Option.flatMap(
    Option.fromUndefinedOr(opened.connections.find(({ connection }) => connection.id === connectionId)),
    ({ connection }) =>
      Option.map(integrationOf(opened, connection.integration), (integration) => ({ connection, integration }))
  )

/** `form` with why it was refused, no longer sending. */
const refused = (form: ConnectionForm, error: string): ConnectionForm =>
  ConnectionForm.match(form, {
    Adding: (adding) => ConnectionForm.Adding({ ...adding, sending: false, error: Option.some(error) }),
    Renaming: (renaming) => ConnectionForm.Renaming(renaming),
    Configuring: (configuring) => ConnectionForm.Configuring({ ...configuring, error: Option.some(error) }),
    ReplacingKey: (replacing) =>
      ConnectionForm.ReplacingKey({ ...replacing, sending: false, error: Option.some(error) })
  })

/** Send the form open among the connections: over HTTP for what carries a key or makes a connection, as an action otherwise. */
const submitConnectionForm = (
  model: Model,
  form: ConnectionForm,
  opened: Opened,
  member: { readonly apiUrl: string; readonly token: string; readonly workspaceId: Opened["workspace"]["id"] }
): UpdateReturn => {
  const leaving = (next: Option.Option<ConnectionForm>) =>
    atConnections(model, (connections) => modifyFields(connections, { form: () => next }))
  const refusing = (error: string) => leaving(Option.some(refused(form, error)))
  return ConnectionForm.match(form, {
    Adding: (adding) =>
      Option.match(integrationOf(opened, adding.integrationId), {
        onNone: () => refusing("Choose an integration."),
        onSome: (integration) =>
          Result.match(SettingsForm.settingsOf(integration.settings, adding.settings), {
            onFailure: refusing,
            onSuccess: (settings) => ({
              ...leaving(Option.some(ConnectionForm.Adding({ ...adding, sending: true, error: Option.none() }))),
              commands: [
                AddConnection({
                  ...member,
                  integration: integration.id,
                  name: adding.name,
                  auth: adding.auth,
                  apiKey: adding.apiKey,
                  settings
                })
              ]
            })
          })
      }),
    Renaming: ({ connectionId, name }) =>
      Option.match(
        Option.fromUndefinedOr(opened.connections.find(({ connection }) => connection.id === connectionId)),
        {
          onNone: () => leaving(Option.none()),
          onSome: ({ connection }) => ({
            ...leaving(Option.none()),
            commands: [RenameConnection({ connectionId, name, expectedName: connection.name })]
          })
        }
      ),
    Configuring: (configuring) =>
      Option.match(connectionOf(opened, configuring.connectionId), {
        onNone: () => leaving(Option.none()),
        onSome: ({ integration }) =>
          Result.match(SettingsForm.settingsOf(integration.settings, configuring.settings), {
            onFailure: refusing,
            onSuccess: (settings) => ({
              ...leaving(Option.none()),
              commands: [ConfigureConnection({ connectionId: configuring.connectionId, settings })]
            })
          })
      }),
    ReplacingKey: (replacing) => ({
      ...leaving(Option.some(ConnectionForm.ReplacingKey({ ...replacing, sending: true, error: Option.none() }))),
      commands: [ReplaceConnectionKey({ ...member, connectionId: replacing.connectionId, apiKey: replacing.apiKey })]
    })
  })
}

/** The open settings, and the workspace they are of, while they are open. */
const settingsIn = (model: Model): Option.Option<{ readonly settings: Settings; readonly opened: Opened }> =>
  Option.flatMap(openedIn(model), (opened) =>
    Option.flatMap(
      opened.pane,
      Pane.matchOrElse({ Settings: ({ settings }) => Option.some({ settings, opened }) }, () => Option.none())
    )
  )

/** The group `groupId` as it opens, listing its threads, or with `thread` open. */
const openedGroup = (groupId: OpenGroup["groupId"], thread: Option.Option<OpenThread["threadId"]>): OpenGroup => ({
  groupId,
  threads: [],
  draft: "",
  thread: Option.map(thread, openedThread),
  renaming: Option.none(),
  adding: Option.none()
})

/** The thread `threadId` as it opens, before its messages are read. */
const openedThread = (threadId: OpenThread["threadId"]): OpenThread => ({
  threadId,
  messages: [],
  draft: "",
  following: Option.none(),
  latest: 0,
  readThrough: 0,
  readRequested: 0,
  renaming: Option.none(),
  editing: Option.none(),
  task: Option.none(),
  turns: [],
  log: Option.none()
})

/** The log as `message` leaves it: its items as they stand once opened, each change in its place, and ended with its turn. */
const followLog = (log: TurnLog, message: Turn.LogMessage): TurnLog =>
  Turn.LogMessage.match(message, {
    Opened: ({ items }) => ({ ...log, items, state: LogState.Open() }),
    Changed: ({ changes }) => ({
      ...log,
      items: changes.reduce(
        (items, { index, item }) => [...items.slice(0, index), item, ...items.slice(index + 1)],
        log.items
      )
    }),
    Ended: () => ({ ...log, state: LogState.Ended() })
  })

/** The newest notification still waiting to be seen, in the inbox order core marks them by. */
const newestWaiting = (inbox: ReadonlyArray<InboxItem>) =>
  inbox
    .map(({ notification }) => notification)
    .filter(({ state }) => Notification.State.isAnyOf(["Pending"])(state))
    .reduce<Option.Option<Notification.Notification>>(
      (newest, notification) =>
        Option.isSome(newest) && !NotificationStore.isAtOrBefore(newest.value, notification)
          ? newest
          : Option.some(notification),
      Option.none()
    )

/** The settings form with nothing being changed, inviting as a member. */
const freshSettings: Settings = {
  workspaceName: Option.none(),
  ownName: Option.none(),
  inviting: { email: "", roleId: BuiltinRoles.MemberId }
}

/** The open thread as `change` makes it, while one is open; otherwise nothing. */
const atThread = (model: Model, change: (thread: OpenThread) => OpenThread): UpdateReturn =>
  atGroup(model, (group) => modifyFields(group, { thread: Option.map(change) }))

/** The open workspace, if one is. */
const openedIn = (model: Model): Option.Option<Opened> =>
  Page.matchOrElse(model.page, { SignedIn: ({ opened }) => opened }, () => Option.none())

/** What the person is starting, as `change` makes it, while they start something; otherwise nothing. */
const atComposing = (model: Model, change: (composing: Composing) => Composing): UpdateReturn =>
  atOpened(model, (opened) => modifyFields(opened, { composing: Option.map(change) }))

/** The person's active membership of `groupId`, if they have one. */
const ownMembership = (model: Model, groupId: OpenGroup["groupId"]) =>
  Option.flatMap(openedIn(model), ({ memberships, memberId }) =>
    Option.fromUndefinedOr(
      memberships.find(
        ({ membership }) =>
          membership.groupId === groupId && membership.memberId === memberId && membership.status === "active"
      )?.membership
    )
  )

/** The open group and the person's member, as following or no longer following it names them. */
const ownFollow = (model: Model) =>
  Option.flatMap(groupIn(model), ({ groupId }) =>
    Option.map(openedIn(model), ({ memberId }) => ({ groupId, memberId }))
  )

/** The name of the team `groupId`, while it is a team. */
const teamNameOf = (model: Model, groupId: OpenGroup["groupId"]): Option.Option<string> =>
  Option.flatMap(openedIn(model), ({ groups }) =>
    Option.flatMap(Option.fromUndefinedOr(groups.find(({ group }) => group.id === groupId)), ({ group }) =>
      "name" in group ? Option.some(group.name) : Option.none()
    )
  )

/** The open thread, if one is. */
const threadIn = (model: Model): Option.Option<OpenThread> => Option.flatMap(groupIn(model), ({ thread }) => thread)

/** The title the open group lists `threadId` with, if it has one. */
const titleOf = (model: Model, threadId: OpenThread["threadId"]): Option.Option<string> =>
  Option.flatMap(groupIn(model), ({ threads }) =>
    Option.flatMap(Option.fromUndefinedOr(threads.find(({ thread }) => thread.id === threadId)), ({ thread }) =>
      Option.fromNullOr(thread.title)
    )
  )

/** The text and revision of `messageId` in the open thread, while it has text. */
const textOf = (thread: OpenThread, messageId: Editing["messageId"]) =>
  Option.flatMap(
    Option.fromUndefinedOr(thread.messages.find(({ message }) => message.id === messageId)),
    ({ message }) =>
      ThreadMessage.Content.match(message.content, {
        Text: ({ text, revision }) => Option.some({ text, revision }),
        Deleted: () => Option.none()
      })
  )

/** The open thread and the task it tracks, while it tracks one. */
const taskIn = (model: Model) =>
  Option.flatMap(threadIn(model), ({ threadId, task }) => Option.map(task, (item) => ({ threadId, task: item.task })))

/** Change the open thread's task in one way, from the value the person sees, unless it already is so. */
const changeTask = (model: Model, changeOf: (task: Task.Task) => Task.Change): UpdateReturn =>
  Option.match(taskIn(model), {
    onNone: () => ({ model }),
    onSome: ({ threadId, task }) => {
      const change = changeOf(task)
      return change.from === change.to ? { model } : { model, commands: [UpdateTask({ threadId, change })] }
    }
  })

/** The open group, if one is. */
const groupIn = (model: Model): Option.Option<OpenGroup> =>
  Option.flatMap(openedIn(model), ({ pane }) =>
    Option.flatMap(
      pane,
      Pane.matchOrElse({ Group: ({ group }) => Option.some(group) }, () => Option.none())
    )
  )

/** The active assignment that makes the workspace's owner its owner. */
const ownerAssignment = (opened: Opened) =>
  Option.fromUndefinedOr(
    opened.assignments.find(
      ({ assignment }) =>
        assignment.memberId === opened.workspace.ownerMemberId &&
        assignment.status === "active" &&
        Assignment.isWorkspaceRole(assignment) &&
        assignment.source.roleId === BuiltinRoles.OwnerId
    )?.assignment
  )

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    TypedEmail: ({ email }) =>
      atForm(model, (form) =>
        SignInForm.matchOrElse(
          form,
          { EnteringEmail: ({ error }) => ({ form: SignInForm.EnteringEmail({ email, error }) }) },
          () => undefined
        )
      ),
    SubmittedEmail: () =>
      atForm(model, (form) =>
        SignInForm.matchOrElse(
          form,
          {
            EnteringEmail: ({ email }) => ({
              form: SignInForm.SendingCode({ email }),
              commands: [SendCode({ apiUrl: model.apiUrl, email })]
            })
          },
          () => undefined
        )
      ),
    SucceededSendCode: () =>
      atForm(model, (form) =>
        SignInForm.matchOrElse(
          form,
          {
            SendingCode: ({ email }) => ({ form: SignInForm.EnteringCode({ email, code: "", error: Option.none() }) })
          },
          () => undefined
        )
      ),
    FailedSendCode: ({ error }) =>
      atForm(model, (form) =>
        SignInForm.matchOrElse(
          form,
          { SendingCode: ({ email }) => ({ form: SignInForm.EnteringEmail({ email, error: Option.some(error) }) }) },
          () => undefined
        )
      ),
    TypedCode: ({ code }) =>
      atForm(model, (form) =>
        SignInForm.matchOrElse(
          form,
          { EnteringCode: ({ email, error }) => ({ form: SignInForm.EnteringCode({ email, code, error }) }) },
          () => undefined
        )
      ),
    SubmittedCode: () =>
      atForm(model, (form) =>
        SignInForm.matchOrElse(
          form,
          {
            EnteringCode: ({ email, code }) => ({
              form: SignInForm.CheckingCode({ email, code }),
              commands: [CheckCode({ apiUrl: model.apiUrl, email, code })]
            })
          },
          () => undefined
        )
      ),
    SucceededSignIn: ({ session }) =>
      Page.matchOrElse(
        model.page,
        {
          SignedOut: () => {
            const next = signedIn(model.apiUrl, session)
            return { ...next, commands: [SaveSession({ apiUrl: model.apiUrl, session }), ...(next.commands ?? [])] }
          }
        },
        () => ({ model })
      ),
    FailedSignIn: ({ error }) =>
      atForm(model, (form) =>
        SignInForm.matchOrElse(
          form,
          {
            CheckingCode: ({ email, code }) => ({
              form: SignInForm.EnteringCode({ email, code, error: Option.some(error) })
            })
          },
          () => undefined
        )
      ),
    CompletedSaveSession: () => ({ model }),
    SucceededLoadWorkspaces: ({ memberships }) =>
      atSignedIn(model, (page) => modifyFields(page, { workspaces: () => Workspaces.Loaded({ memberships }) })),
    FailedLoadWorkspaces: ({ error }) =>
      atSignedIn(model, (page) => modifyFields(page, { workspaces: () => Workspaces.Failed({ error }) })),
    ClickedWorkspace: ({ workspaceId }) =>
      atSignedIn(model, (page) =>
        Workspaces.matchOrElse(
          page.workspaces,
          {
            Loaded: ({ memberships }) => {
              const membership = memberships.find(({ workspace }) => workspace.id === workspaceId)
              if (membership === undefined) return page
              return modifyFields(page, {
                opened: () =>
                  Option.some({
                    workspace: membership.workspace,
                    workspacePending: false,
                    memberId: membership.member.id,
                    store: StoreState.Opening(),
                    groups: [],
                    members: [],
                    roles: [],
                    assignments: [],
                    invitations: [],
                    inbox: [],
                    memberships: [],
                    follows: [],
                    connections: [],
                    integrations: Option.none(),
                    actions: [],
                    notice: Option.none(),
                    composing: Option.none(),
                    pane: Option.none()
                  })
              })
            }
          },
          () => page
        )
      ),
    ClickedAllWorkspaces: () => atSignedIn(model, (page) => modifyFields(page, { opened: () => Option.none() })),
    AcquiredStore: () =>
      atStore(model, (store) => StoreState.matchOrElse(store, { Opening: () => StoreState.Open() }, () => store)),
    ReleasedStore: () => ({ model }),
    FailedAcquireStore: ({ error }) => atStore(model, () => StoreState.Failed({ error })),
    FailedReadStore: ({ error }) => atStore(model, () => StoreState.Failed({ error })),
    GotGroups: ({ groups }) =>
      atOpened(model, (opened) =>
        modifyFields(opened, {
          groups: () => groups,
          // A group the person can no longer see, as one they left or one refused, closes.
          pane: Option.filter(
            Pane.matchOrElse(
              { Group: ({ group: open }) => groups.some(({ group }) => group.id === open.groupId) },
              () => true
            )
          )
        })
      ),
    GotWorkspace: ({ workspace, pending }) =>
      atOpened(model, (opened) =>
        modifyFields(opened, { workspace: () => workspace, workspacePending: () => pending })
      ),
    GotMembers: ({ members }) => atOpened(model, (opened) => modifyFields(opened, { members: () => members })),
    GotRoles: ({ roles }) => atOpened(model, (opened) => modifyFields(opened, { roles: () => roles })),
    GotAssignments: ({ assignments }) =>
      atOpened(model, (opened) => modifyFields(opened, { assignments: () => assignments })),
    GotInvitations: ({ invitations }) =>
      atOpened(model, (opened) => modifyFields(opened, { invitations: () => invitations })),
    GotInbox: ({ items }) => atOpened(model, (opened) => modifyFields(opened, { inbox: () => items })),
    ClickedInbox: () => atOpened(model, (opened) => modifyFields(opened, { pane: () => Option.some(Pane.Inbox()) })),
    // Opening the thread reads it, which settles its notifications.
    ClickedNotification: ({ notificationId }) =>
      atOpened(model, (opened) => {
        const source = opened.inbox.find(({ notification }) => notification.id === notificationId)?.notification.thread
        return source === undefined
          ? opened
          : modifyFields(opened, {
              pane: () => Option.some(Pane.Group({ group: openedGroup(source.groupId, Option.some(source.threadId)) }))
            })
      }),
    ClickedMarkSeen: ({ notificationId }) => ({ model, commands: [MarkNotificationSeen({ notificationId })] }),
    ClickedMarkAllSeen: () =>
      Option.match(
        Option.flatMap(openedIn(model), ({ inbox }) => newestWaiting(inbox)),
        {
          onNone: () => ({ model }),
          onSome: ({ recordedAt, id }) => ({
            model,
            commands: [MarkAllNotificationsSeen({ through: { recordedAt, id } })]
          })
        }
      ),
    GotConnections: ({ connections }) =>
      atOpened(model, (opened) =>
        modifyFields(opened, {
          connections: () => connections,
          // A form about a connection no longer there, as one removed, closes.
          pane: Option.map(
            Pane.matchOrElse(
              {
                Connections: ({ connections: pane }) =>
                  Pane.Connections({
                    connections: modifyFields(pane, {
                      form: Option.filter((form) =>
                        ConnectionForm.matchOrElse(
                          form,
                          {
                            Renaming: ({ connectionId }) =>
                              connections.some(({ connection }) => connection.id === connectionId),
                            Configuring: ({ connectionId }) =>
                              connections.some(({ connection }) => connection.id === connectionId),
                            ReplacingKey: ({ connectionId }) =>
                              connections.some(({ connection }) => connection.id === connectionId)
                          },
                          () => true
                        )
                      )
                    })
                  })
              },
              (pane) => pane
            )
          )
        })
      ),
    // The host's integrations are asked for once the person opens the connections, and again after it could not be reached.
    ClickedConnections: () => {
      const loading = Option.exists(
        Option.flatMap(openedIn(model), ({ integrations }) => integrations),
        Integrations.isAnyOf(["Loading", "Loaded"])
      )
      const opening = atOpened(model, (opened) =>
        modifyFields(opened, {
          pane: () => Option.some(Pane.Connections({ connections: { form: Option.none(), check: Option.none() } })),
          integrations: (integrations) => (loading ? integrations : Option.some(Integrations.Loading()))
        })
      )
      return Option.match(asMemberIn(model), {
        onNone: () => opening,
        onSome: (member) => (loading ? opening : { ...opening, commands: [LoadIntegrations(member)] })
      })
    },
    GotIntegrations: ({ integrations }) =>
      atOpened(model, (opened) =>
        modifyFields(opened, { integrations: () => Option.some(Integrations.Loaded({ integrations })) })
      ),
    FailedLoadIntegrations: ({ error }) =>
      atOpened(model, (opened) =>
        modifyFields(opened, { integrations: () => Option.some(Integrations.Failed({ error })) })
      ),
    ClickedAddConnection: () =>
      atConnections(model, (connections) =>
        modifyFields(connections, {
          form: () =>
            Option.some(
              ConnectionForm.Adding({
                integrationId: "",
                name: "",
                auth: "none",
                apiKey: "",
                settings: {},
                sending: false,
                error: Option.none()
              })
            )
        })
      ),
    ChoseIntegration: ({ integrationId }) =>
      atConnectionForm(model, (form, opened) =>
        ConnectionForm.matchOrElse(
          form,
          {
            Adding: (adding) =>
              Option.match(integrationOf(opened, integrationId), {
                onNone: () => ConnectionForm.Adding({ ...adding, integrationId }),
                onSome: (integration) =>
                  ConnectionForm.Adding({
                    ...adding,
                    integrationId,
                    name: adding.name === "" ? integration.name : adding.name,
                    auth: integration.auth[0],
                    settings: SettingsForm.draftOf(integration.settings),
                    error: Option.none()
                  })
              })
          },
          () => form
        )
      ),
    TypedConnectionName: ({ name }) =>
      atConnectionForm(model, (form) =>
        ConnectionForm.matchOrElse(
          form,
          {
            Adding: (adding) => ConnectionForm.Adding({ ...adding, name }),
            Renaming: (renaming) => ConnectionForm.Renaming({ ...renaming, name })
          },
          () => form
        )
      ),
    ChoseConnectionAuth: ({ auth }) =>
      atConnectionForm(model, (form) =>
        ConnectionForm.matchOrElse(form, { Adding: (adding) => ConnectionForm.Adding({ ...adding, auth }) }, () => form)
      ),
    TypedApiKey: ({ apiKey }) =>
      atConnectionForm(model, (form) =>
        ConnectionForm.matchOrElse(
          form,
          {
            Adding: (adding) => ConnectionForm.Adding({ ...adding, apiKey }),
            ReplacingKey: (replacing) => ConnectionForm.ReplacingKey({ ...replacing, apiKey })
          },
          () => form
        )
      ),
    ChangedSetting: ({ name, value }) =>
      atConnectionForm(model, (form) =>
        ConnectionForm.matchOrElse(
          form,
          {
            Adding: (adding) => ConnectionForm.Adding({ ...adding, settings: { ...adding.settings, [name]: value } }),
            Configuring: (configuring) =>
              ConnectionForm.Configuring({ ...configuring, settings: { ...configuring.settings, [name]: value } })
          },
          () => form
        )
      ),
    SubmittedConnectionForm: () =>
      Option.match(
        Option.flatMap(connectionsIn(model), ({ connections, opened }) =>
          Option.flatMap(connections.form, (form) =>
            Option.map(asMemberIn(model), (member) => ({ form, opened, member }))
          )
        ),
        {
          onNone: () => ({ model }),
          onSome: ({ form, opened, member }) => submitConnectionForm(model, form, opened, member)
        }
      ),
    ClickedCancelConnectionForm: () =>
      atConnections(model, (connections) => modifyFields(connections, { form: () => Option.none() })),
    AddedConnection: () =>
      atConnections(model, (connections) =>
        modifyFields(connections, {
          form: Option.filter((form) => !ConnectionForm.isAnyOf(["Adding"])(form))
        })
      ),
    FailedAddConnection: ({ error }) =>
      atConnectionForm(model, (form) => (ConnectionForm.isAnyOf(["Adding"])(form) ? refused(form, error) : form)),
    ClickedRenameConnection: ({ connectionId }) =>
      atConnections(model, (connections, opened) =>
        modifyFields(connections, {
          form: () =>
            Option.map(
              Option.fromUndefinedOr(opened.connections.find(({ connection }) => connection.id === connectionId)),
              ({ connection }) => ConnectionForm.Renaming({ connectionId, name: connection.name })
            )
        })
      ),
    ClickedConfigureConnection: ({ connectionId }) =>
      atConnections(model, (connections, opened) =>
        modifyFields(connections, {
          form: () =>
            Option.map(connectionOf(opened, connectionId), ({ connection, integration }) =>
              ConnectionForm.Configuring({
                connectionId,
                settings: SettingsForm.draftOf(integration.settings, connection.settings),
                error: Option.none()
              })
            )
        })
      ),
    ClickedReplaceKey: ({ connectionId }) =>
      atConnections(model, (connections) =>
        modifyFields(connections, {
          form: () =>
            Option.some(ConnectionForm.ReplacingKey({ connectionId, apiKey: "", sending: false, error: Option.none() }))
        })
      ),
    ReplacedKey: () =>
      atConnections(model, (connections) =>
        modifyFields(connections, {
          form: Option.filter((form) => !ConnectionForm.isAnyOf(["ReplacingKey"])(form))
        })
      ),
    FailedReplaceKey: ({ error }) =>
      atConnectionForm(model, (form) => (ConnectionForm.isAnyOf(["ReplacingKey"])(form) ? refused(form, error) : form)),
    ClickedCheckConnection: ({ connectionId }) =>
      Option.match(asMemberIn(model), {
        onNone: () => ({ model }),
        onSome: (member) => ({
          ...atConnections(model, (connections) =>
            modifyFields(connections, { check: () => Option.some({ connectionId, check: Check.Checking() }) })
          ),
          commands: [CheckConnection({ ...member, connectionId })]
        })
      }),
    CheckedConnection: ({ connectionId, health }) =>
      atConnections(model, (connections) =>
        modifyFields(connections, {
          check: Option.map((check) =>
            check.connectionId === connectionId ? { connectionId, check: Check.Checked({ health }) } : check
          )
        })
      ),
    FailedCheckConnection: ({ connectionId, error }) =>
      atConnections(model, (connections) =>
        modifyFields(connections, {
          check: Option.map((check) =>
            check.connectionId === connectionId ? { connectionId, check: Check.Failed({ error }) } : check
          )
        })
      ),
    ClickedRemoveConnection: ({ connectionId }) => ({ model, commands: [RemoveConnection({ connectionId })] }),
    ClickedSettings: () =>
      atOpened(model, (opened) =>
        modifyFields(opened, { pane: () => Option.some(Pane.Settings({ settings: freshSettings })) })
      ),
    ClickedRenameWorkspace: () =>
      atSettings(model, (settings, opened) => ({ ...settings, workspaceName: Option.some(opened.workspace.name) })),
    TypedWorkspaceName: ({ name }) =>
      atSettings(model, (settings) => ({ ...settings, workspaceName: Option.some(name) })),
    SubmittedWorkspaceName: () =>
      Option.match(settingsIn(model), {
        onNone: () => ({ model }),
        onSome: ({ settings, opened }) =>
          Option.match(settings.workspaceName, {
            onNone: () => ({ model }),
            onSome: (name) => ({
              ...atSettings(model, (settings) => ({ ...settings, workspaceName: Option.none() })),
              commands: [RenameWorkspace({ name, expectedName: opened.workspace.name })]
            })
          })
      }),
    ClickedCancelWorkspaceName: () => atSettings(model, (settings) => ({ ...settings, workspaceName: Option.none() })),
    ClickedRenameSelf: () =>
      atSettings(model, (settings, opened) => ({
        ...settings,
        ownName: Option.some(opened.members.find(({ member }) => member.id === opened.memberId)?.member.name ?? "")
      })),
    TypedOwnName: ({ name }) => atSettings(model, (settings) => ({ ...settings, ownName: Option.some(name) })),
    SubmittedOwnName: () =>
      Option.match(
        Option.flatMap(settingsIn(model), ({ settings }) => settings.ownName),
        {
          onNone: () => ({ model }),
          onSome: (name) => ({
            ...atSettings(model, (settings) => ({ ...settings, ownName: Option.none() })),
            commands: [RenameSelf({ name })]
          })
        }
      ),
    ClickedCancelOwnName: () => atSettings(model, (settings) => ({ ...settings, ownName: Option.none() })),
    ChoseRole: ({ memberId, roleId }) =>
      Option.match(openedIn(model), {
        onNone: () => ({ model }),
        onSome: (opened) => ({
          model,
          commands: [
            ChangeRole({
              memberId,
              roleId,
              expectedAssignmentIds: workspaceRolesOf(opened, memberId).map(({ id }) => id)
            })
          ]
        })
      }),
    ClickedRemoveMember: ({ memberId }) => ({ model, commands: [RemoveMember({ memberId })] }),
    ClickedTransferOwnership: ({ memberId }) =>
      Option.match(Option.flatMap(openedIn(model), ownerAssignment), {
        onNone: () => ({ model }),
        onSome: ({ id }) => ({ model, commands: [TransferOwnership({ memberId, expectedOwnerAssignmentId: id })] })
      }),
    TypedInviteEmail: ({ email }) =>
      atSettings(model, (settings) => ({ ...settings, inviting: { ...settings.inviting, email } })),
    ChoseInviteRole: ({ roleId }) =>
      atSettings(model, (settings) => ({ ...settings, inviting: { ...settings.inviting, roleId } })),
    SubmittedInvite: () =>
      Option.match(settingsIn(model), {
        onNone: () => ({ model }),
        onSome: ({ settings }) => ({
          ...atSettings(model, (settings) => ({ ...settings, inviting: { ...settings.inviting, email: "" } })),
          commands: [Invite(settings.inviting)]
        })
      }),
    ClickedRevokeInvitation: ({ invitationId }) => ({ model, commands: [RevokeInvitation({ invitationId })] }),
    GotMemberships: ({ memberships }) =>
      atOpened(model, (opened) => modifyFields(opened, { memberships: () => memberships })),
    GotFollows: ({ follows }) => atOpened(model, (opened) => modifyFields(opened, { follows: () => follows })),
    ClickedNewTeam: () =>
      atOpened(model, (opened) =>
        modifyFields(opened, { composing: () => Option.some(Composing.Team({ name: "", isPublic: false })) })
      ),
    TypedTeamName: ({ name }) =>
      atComposing(model, (composing) =>
        Composing.matchOrElse(composing, { Team: (team) => Composing.Team({ ...team, name }) }, () => composing)
      ),
    ToggledTeamPublic: ({ isPublic }) =>
      atComposing(model, (composing) =>
        Composing.matchOrElse(composing, { Team: (team) => Composing.Team({ ...team, isPublic }) }, () => composing)
      ),
    SubmittedTeam: () =>
      Option.match(openedIn(model), {
        onNone: () => ({ model }),
        onSome: ({ composing, memberId }) =>
          Option.match(
            Option.flatMap(
              composing,
              Composing.matchOrElse({ Team: (team) => Option.some(team) }, () => Option.none())
            ),
            {
              onNone: () => ({ model }),
              onSome: ({ name, isPublic }) => ({
                ...atOpened(model, (opened) => modifyFields(opened, { composing: () => Option.none() })),
                commands: [CreateTeam({ name, memberIds: [memberId], visibility: isPublic ? "Public" : "Private" })]
              })
            }
          )
      }),
    ClickedNewDirect: () =>
      atOpened(model, (opened) =>
        modifyFields(opened, { composing: () => Option.some(Composing.Direct({ memberId: Option.none(), text: "" })) })
      ),
    ChoseDirectMember: ({ memberId }) =>
      atComposing(model, (composing) =>
        Composing.matchOrElse(
          composing,
          { Direct: (direct) => Composing.Direct({ ...direct, memberId }) },
          () => composing
        )
      ),
    TypedDirect: ({ text }) =>
      atComposing(model, (composing) =>
        Composing.matchOrElse(composing, { Direct: (direct) => Composing.Direct({ ...direct, text }) }, () => composing)
      ),
    SubmittedDirect: () =>
      Option.match(
        Option.flatMap(openedIn(model), ({ composing }) =>
          Option.flatMap(
            composing,
            Composing.matchOrElse(
              { Direct: ({ memberId, text }) => Option.map(memberId, (memberId) => ({ memberId, text })) },
              () => Option.none()
            )
          )
        ),
        {
          onNone: () => ({ model }),
          onSome: (direct) => ({
            ...atOpened(model, (opened) => modifyFields(opened, { composing: () => Option.none() })),
            commands: [StartDirect(direct)]
          })
        }
      ),
    ClickedCancelCompose: () => atOpened(model, (opened) => modifyFields(opened, { composing: () => Option.none() })),
    ClickedJoin: ({ groupId }) => ({ model, commands: [JoinGroup({ groupId })] }),
    ClickedLeave: () =>
      Option.match(
        Option.flatMap(groupIn(model), ({ groupId }) =>
          Option.map(ownMembership(model, groupId), ({ id }) => ({ groupId, membershipId: id }))
        ),
        { onNone: () => ({ model }), onSome: (input) => ({ model, commands: [LeaveGroup(input)] }) }
      ),
    ClickedFollowGroup: () =>
      Option.match(ownFollow(model), {
        onNone: () => ({ model }),
        onSome: (input) => ({ model, commands: [FollowGroup(input)] })
      }),
    ClickedUnfollowGroup: () =>
      Option.match(ownFollow(model), {
        onNone: () => ({ model }),
        onSome: (input) => ({ model, commands: [UnfollowGroup(input)] })
      }),
    ClickedRenameGroup: () =>
      atGroup(model, (group) =>
        modifyFields(group, {
          renaming: () => Option.some(Option.getOrElse(teamNameOf(model, group.groupId), () => ""))
        })
      ),
    TypedGroupName: ({ name }) => atGroup(model, (group) => modifyFields(group, { renaming: () => Option.some(name) })),
    SubmittedGroupName: () =>
      Option.match(groupIn(model), {
        onNone: () => ({ model }),
        onSome: ({ groupId, renaming }) =>
          Option.match(
            Option.flatMap(renaming, (name) =>
              Option.map(teamNameOf(model, groupId), (expectedName) => ({ groupId, name, expectedName }))
            ),
            {
              onNone: () => ({ model }),
              onSome: (input) => ({
                ...atGroup(model, (group) => modifyFields(group, { renaming: () => Option.none() })),
                commands: [RenameGroup(input)]
              })
            }
          )
      }),
    ClickedCancelGroupName: () => atGroup(model, (group) => modifyFields(group, { renaming: () => Option.none() })),
    ChoseGroupMemberToAdd: ({ memberId }) => atGroup(model, (group) => modifyFields(group, { adding: () => memberId })),
    SubmittedAddGroupMember: () =>
      Option.match(
        Option.flatMap(groupIn(model), ({ groupId, adding }) =>
          Option.map(adding, (memberId) => ({ groupId, memberId }))
        ),
        {
          onNone: () => ({ model }),
          onSome: (input) => ({
            ...atGroup(model, (group) => modifyFields(group, { adding: () => Option.none() })),
            commands: [AddGroupMember(input)]
          })
        }
      ),
    ClickedRemoveGroupMember: ({ membershipId }) =>
      Option.match(groupIn(model), {
        onNone: () => ({ model }),
        onSome: ({ groupId }) => ({ model, commands: [RemoveGroupMember({ groupId, membershipId })] })
      }),
    GotActions: ({ actions }) => atOpened(model, (opened) => modifyFields(opened, { actions: () => actions })),
    GotThreads: ({ groupId, threads }) =>
      atGroup(model, (group) => (group.groupId === groupId ? modifyFields(group, { threads: () => threads }) : group)),
    GotThread: ({ threadId, messages, following, latest, readThrough, task, turns }) =>
      Option.match(
        Option.filter(threadIn(model), (thread) => thread.threadId === threadId),
        {
          onNone: () => ({ model }),
          onSome: (thread) => {
            // Reading it open marks it read through its latest activity, once for each.
            const marking = latest > Math.max(readThrough, thread.readRequested)
            return {
              ...atThread(model, (open) =>
                modifyFields(open, {
                  messages: () => messages,
                  following: () => following,
                  latest: () => latest,
                  readThrough: () => readThrough,
                  readRequested: (requested) => (marking ? latest : requested),
                  task: () => task,
                  turns: () => turns
                })
              ),
              commands: marking ? [MarkThreadRead({ threadId, throughSequence: latest })] : []
            }
          }
        }
      ),
    ClickedGroup: ({ groupId }) =>
      atOpened(model, (opened) =>
        modifyFields(opened, {
          pane: () => Option.some(Pane.Group({ group: openedGroup(groupId, Option.none()) }))
        })
      ),
    ClickedThread: ({ threadId }) =>
      atGroup(model, (group) => modifyFields(group, { thread: () => Option.some(openedThread(threadId)) })),
    ClickedAllThreads: () => atGroup(model, (group) => modifyFields(group, { thread: () => Option.none() })),
    TypedThread: ({ text }) => atGroup(model, (group) => modifyFields(group, { draft: () => text })),
    SubmittedThread: () =>
      Option.match(groupIn(model), {
        onNone: () => ({ model }),
        onSome: ({ groupId, draft }) => ({
          ...atGroup(model, (group) => modifyFields(group, { draft: () => "" })),
          commands: [StartThread({ groupId, text: draft })]
        })
      }),
    TypedReply: ({ text }) => atThread(model, (thread) => modifyFields(thread, { draft: () => text })),
    SubmittedReply: () =>
      Option.match(
        Option.flatMap(groupIn(model), ({ thread }) => thread),
        {
          onNone: () => ({ model }),
          onSome: ({ threadId, draft }) => ({
            ...atThread(model, (thread) => modifyFields(thread, { draft: () => "" })),
            commands: [PostReply({ threadId, text: draft })]
          })
        }
      ),
    ClickedRename: () =>
      atThread(model, (thread) =>
        modifyFields(thread, {
          renaming: () =>
            Option.some(Option.match(titleOf(model, thread.threadId), { onNone: () => "", onSome: (title) => title }))
        })
      ),
    TypedTitle: ({ title }) =>
      atThread(model, (thread) => modifyFields(thread, { renaming: () => Option.some(title) })),
    SubmittedRename: () =>
      Option.match(threadIn(model), {
        onNone: () => ({ model }),
        onSome: ({ threadId, renaming }) =>
          Option.match(renaming, {
            onNone: () => ({ model }),
            onSome: (title) => ({
              ...atThread(model, (thread) => modifyFields(thread, { renaming: () => Option.none() })),
              commands: [RenameThread({ threadId, title, expectedTitle: Option.getOrNull(titleOf(model, threadId)) })]
            })
          })
      }),
    ClickedCancelRename: () => atThread(model, (thread) => modifyFields(thread, { renaming: () => Option.none() })),
    ClickedEdit: ({ messageId }) =>
      atThread(model, (thread) =>
        modifyFields(thread, {
          editing: () => Option.map(textOf(thread, messageId), ({ text }) => ({ messageId, draft: text }))
        })
      ),
    TypedEdit: ({ text }) =>
      atThread(model, (thread) =>
        modifyFields(thread, { editing: Option.map((editing) => modifyFields(editing, { draft: () => text })) })
      ),
    SubmittedEdit: () =>
      Option.match(threadIn(model), {
        onNone: () => ({ model }),
        onSome: (thread) =>
          Option.match(
            Option.flatMap(thread.editing, (editing) =>
              Option.map(textOf(thread, editing.messageId), ({ revision }) => ({ ...editing, revision }))
            ),
            {
              onNone: () => ({ model }),
              onSome: ({ messageId, draft, revision }) => ({
                ...atThread(model, (open) => modifyFields(open, { editing: () => Option.none() })),
                commands: [EditMessage({ messageId, text: draft, expectedRevision: revision })]
              })
            }
          )
      }),
    ClickedCancelEdit: () => atThread(model, (thread) => modifyFields(thread, { editing: () => Option.none() })),
    ClickedDelete: ({ messageId }) => ({ model, commands: [DeleteMessage({ messageId })] }),
    ClickedFollow: () =>
      Option.match(threadIn(model), {
        onNone: () => ({ model }),
        onSome: ({ threadId }) => ({ model, commands: [FollowThread({ threadId })] })
      }),
    ClickedUnfollow: () =>
      Option.match(
        Option.flatMap(threadIn(model), ({ threadId, following }) =>
          Option.map(following, ({ participationId }) => ({ threadId, participationId }))
        ),
        {
          onNone: () => ({ model }),
          onSome: (input) => ({ model, commands: [UnfollowThread(input)] })
        }
      ),
    ClickedMakeTask: () =>
      Option.match(threadIn(model), {
        onNone: () => ({ model }),
        onSome: ({ threadId }) => ({ model, commands: [CreateTask({ threadId })] })
      }),
    ChoseTaskStatus: ({ status }) =>
      changeTask(model, (task) => Task.Change.cases.Status.make({ from: task.status, to: status })),
    ChoseTaskPriority: ({ priority }) =>
      changeTask(model, (task) => Task.Change.cases.Priority.make({ from: task.priority, to: priority })),
    ChoseTaskAssignee: ({ memberId }) =>
      changeTask(model, (task) =>
        Task.Change.cases.Assignee.make({ from: task.assignee, to: Option.getOrNull(memberId) })
      ),
    ClickedStopTurn: ({ turnId }) => ({ model, commands: [StopTurn({ turnId })] }),
    ClickedRetryTurn: ({ turnId }) => ({ model, commands: [RetryTurn({ turnId })] }),
    ClickedShowLog: ({ turnId }) =>
      atThread(model, (thread) =>
        modifyFields(thread, { log: () => Option.some({ turnId, items: [], state: LogState.Opening() }) })
      ),
    ClickedHideLog: () => atThread(model, (thread) => modifyFields(thread, { log: () => Option.none() })),
    GotTurnLog: ({ turnId, message }) =>
      atThread(model, (thread) =>
        modifyFields(thread, {
          log: Option.map((log) => (log.turnId === turnId ? followLog(log, message) : log))
        })
      ),
    FailedFollowLog: ({ turnId, error }) =>
      atThread(model, (thread) =>
        modifyFields(thread, {
          log: Option.map((log) =>
            log.turnId === turnId ? modifyFields(log, { state: () => LogState.Failed({ error }) }) : log
          )
        })
      ),
    WroteAction: () => atOpened(model, (opened) => modifyFields(opened, { notice: () => Option.none() })),
    FailedWriteAction: ({ error }) =>
      atOpened(model, (opened) => modifyFields(opened, { notice: () => Option.some(error) })),
    ClickedDismiss: ({ key }) => ({ model, commands: [Dismiss({ key })] }),
    CompletedDismiss: () => ({ model }),
    ClickedSignOut: () =>
      Page.matchOrElse(
        model.page,
        {
          SignedIn: ({ session }) => ({
            model: signedOut(model.apiUrl, session.account.email),
            commands: [SignOut({ apiUrl: model.apiUrl, session })]
          })
        },
        () => ({ model })
      ),
    CompletedSignOut: () => ({ model })
  })
