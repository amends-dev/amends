/**
 * How each message changes the app: signing in a step at a time, listing and opening workspaces,
 * following the open store, what the person does in its groups, threads, and settings, and signing
 * out. A message that comes when the page is past it, such as a code check finishing after the
 * person signed out, changes nothing.
 */

import { Assignment, BuiltinRoles } from "@amends-dev/core/authorization"
import { ThreadMessage } from "@amends-dev/core/thread"
import type * as SignIn from "@amends-dev/gateway/SignIn"
import type * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type { Update } from "foldkit"
import type * as ManagedResource from "foldkit/managedResource"
import { modifyFields } from "foldkit/struct"
import type * as Browser from "./browser.ts"
import { CheckCode, LoadWorkspaces, SaveSession, SendCode, SignOut } from "./command.ts"
import type { Flags } from "./flags.ts"
import { Message } from "./message.ts"
import {
  Composing,
  type Editing,
  type Model,
  type OpenGroup,
  type Opened,
  type OpenThread,
  Page,
  Pane,
  type Settings,
  SignInForm,
  StoreState,
  Workspaces
} from "./model.ts"
import { workspaceRolesOf } from "./permissions.ts"
import {
  AddGroupMember,
  ChangeRole,
  CreateTeam,
  DeleteMessage,
  Dismiss,
  EditMessage,
  FollowGroup,
  FollowThread,
  Invite,
  JoinGroup,
  LeaveGroup,
  MarkThreadRead,
  PostReply,
  RemoveGroupMember,
  RemoveMember,
  RenameGroup,
  RenameSelf,
  RenameThread,
  RenameWorkspace,
  RevokeInvitation,
  StartDirect,
  StartThread,
  type StoreResource,
  TransferOwnership,
  UnfollowGroup,
  UnfollowThread
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

/** The open settings, and the workspace they are of, while they are open. */
const settingsIn = (model: Model): Option.Option<{ readonly settings: Settings; readonly opened: Opened }> =>
  Option.flatMap(openedIn(model), (opened) =>
    Option.flatMap(
      opened.pane,
      Pane.matchOrElse({ Settings: ({ settings }) => Option.some({ settings, opened }) }, () => Option.none())
    )
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
                    memberships: [],
                    follows: [],
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
    GotThread: ({ threadId, messages, following, latest, readThrough }) =>
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
                  readRequested: (requested) => (marking ? latest : requested)
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
          pane: () =>
            Option.some(
              Pane.Group({
                group: {
                  groupId,
                  threads: [],
                  draft: "",
                  thread: Option.none(),
                  renaming: Option.none(),
                  adding: Option.none()
                }
              })
            )
        })
      ),
    ClickedThread: ({ threadId }) =>
      atGroup(model, (group) =>
        modifyFields(group, {
          thread: () =>
            Option.some({
              threadId,
              messages: [],
              draft: "",
              following: Option.none(),
              latest: 0,
              readThrough: 0,
              readRequested: 0,
              renaming: Option.none(),
              editing: Option.none()
            })
        })
      ),
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
