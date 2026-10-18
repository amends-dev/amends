/**
 * What the person sees: signing in, their workspaces, and the open workspace: the groups they
 * belong to and the teams they may join, a group's members and threads, a thread's messages, the
 * task it tracks, and its agents' turns with their logs, and the workspace's settings, with what
 * the person started or changed shown at once, marked as
 * sending until the server has it, and what the server refused, with why. A control shows only
 * when the person may use it. Markup only: the headless components from `@foldkit/ui` give each
 * control its attributes, and no styles yet.
 */

import { AgentPermissions } from "@amends-dev/core/agent"
import { AssignmentPermissions, BuiltinRoles, type Role, Target } from "@amends-dev/core/authorization"
import { Group, GroupMembershipPermissions, GroupPermissions } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { Notification } from "@amends-dev/core/notification"
import { Task, TaskPermissions } from "@amends-dev/core/task"
import { type Thread, ThreadMessage } from "@amends-dev/core/thread"
import { Turn } from "@amends-dev/core/turn"
import {
  Invitation,
  InvitationPermissions,
  type Member,
  MemberPermissions,
  OwnershipPermissions,
  WorkspaceSettingsPermissions
} from "@amends-dev/core/workspace"
import * as Button from "@foldkit/ui/button"
import * as Checkbox from "@foldkit/ui/checkbox"
import * as Input from "@foldkit/ui/input"
import * as Select from "@foldkit/ui/select"
import * as Textarea from "@foldkit/ui/textarea"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Document, Html, HtmlBuilder } from "foldkit/html"
import { Message } from "./message.ts"
import {
  type ActionItem,
  Composing,
  type Following,
  type GroupItem,
  type InboxItem,
  LogState,
  type MessageItem,
  type Model,
  type OpenGroup,
  type Opened,
  type OpenThread,
  Page,
  Pane,
  type Settings,
  SignInForm,
  StoreState,
  type ThreadItem,
  type TurnItem,
  type TurnLog,
  Workspaces
} from "./model.ts"
import { givableRoles, isOwner, may, mayActOn, permits, workspaceRolesOf } from "./permissions.ts"

type SignedIn = Extract<Page, { readonly _tag: "SignedIn" }>

const errorView = (error: Option.Option<string>, h: HtmlBuilder<Message>): Html =>
  Option.match(error, { onNone: () => h.empty, onSome: (text) => h.p([h.Role("alert")], [text]) })

const field = (
  h: HtmlBuilder<Message>,
  config: Readonly<{ id: string; label: string; type: string; value: string; onInput: (value: string) => Message }>,
  error: Option.Option<string>
) =>
  Input.view(
    {
      id: config.id,
      type: config.type,
      value: config.value,
      onInput: config.onInput,
      isInvalid: Option.isSome(error),
      isAutofocus: true,
      toView: (attributes) =>
        h.div([], [h.label(attributes.label, [config.label]), h.input(attributes.input), errorView(error, h)])
    },
    h
  )

const submit = (h: HtmlBuilder<Message>, label: string) =>
  Button.view({ type: "submit", toView: (attributes) => h.button(attributes.button, [label]) }, h)

const signInView = (form: SignInForm, h: HtmlBuilder<Message>): Html =>
  SignInForm.match(form, {
    EnteringEmail: ({ email, error }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedEmail())],
        [
          h.h1([], ["Sign in"]),
          field(
            h,
            {
              id: "email",
              label: "Email",
              type: "email",
              value: email,
              onInput: (email) => Message.TypedEmail({ email })
            },
            error
          ),
          submit(h, "Send a code")
        ]
      ),
    SendingCode: ({ email }) => h.p([], [`Sending a code to ${email}…`]),
    EnteringCode: ({ email, code, error }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedCode())],
        [
          h.h1([], ["Sign in"]),
          h.p([], [`Enter the code sent to ${email}.`]),
          field(
            h,
            { id: "code", label: "Code", type: "text", value: code, onInput: (code) => Message.TypedCode({ code }) },
            error
          ),
          submit(h, "Sign in")
        ]
      ),
    CheckingCode: () => h.p([], ["Checking the code…"])
  })

const workspacesView = (workspaces: Workspaces, h: HtmlBuilder<Message>): Html =>
  Workspaces.match(workspaces, {
    Loading: () => h.p([], ["Loading your workspaces…"]),
    Failed: ({ error }) => h.p([h.Role("alert")], [error]),
    Loaded: ({ memberships }) =>
      memberships.length === 0
        ? h.p([], ["You belong to no workspace yet."])
        : h.ul(
            [h.AriaLabel("Workspaces")],
            memberships.map(({ workspace }) =>
              h.keyed("li")(
                workspace.id,
                [],
                [
                  Button.view(
                    {
                      onClick: Message.ClickedWorkspace({ workspaceId: workspace.id }),
                      toView: (attributes) => h.button(attributes.button, [workspace.name])
                    },
                    h
                  )
                ]
              )
            )
          )
  })

const textarea = (
  h: HtmlBuilder<Message>,
  config: Readonly<{ id: string; label: string; value: string; onInput: (value: string) => Message }>
) =>
  Textarea.view(
    {
      id: config.id,
      value: config.value,
      rows: 3,
      onInput: config.onInput,
      toView: (attributes) => h.div([], [h.label(attributes.label, [config.label]), h.textarea(attributes.textarea)])
    },
    h
  )

/** A member by their name here. */
const memberName = (memberId: Member.Member["id"], opened: Opened) =>
  opened.members.find(({ member }) => member.id === memberId)?.member.name ?? "Someone"

/** A group's name: a team's own, or the person's direct group's other members, by their names here. */
const groupName = (group: Group.Group, opened: Opened) =>
  "name" in group
    ? group.name
    : group.memberIds
        .filter((id) => id !== opened.memberId)
        .map((id) => memberName(id, opened))
        .join(", ")

/**
 * Whether the person belongs to `groupId`: whether it is a direct group of theirs, whose members are
 * fixed, or they hold an active membership of it, or are being admitted.
 */
const belongsTo = (opened: Opened, groupId: Group.Group["id"]) =>
  opened.groups.some(
    ({ group }) => group.id === groupId && group.kind === "Direct" && group.memberIds.includes(opened.memberId)
  ) ||
  opened.memberships.some(
    ({ membership }) =>
      membership.groupId === groupId && membership.memberId === opened.memberId && membership.status === "active"
  )

/** Whether anyone in the workspace may join `group`: whether it is a public team. */
const isJoinable = (group: Group.Group) => group.kind === "Team" && group.visibility === "Public"

/** Who wrote a message, by their name here. */
const authorName = (message: ThreadMessage.ThreadMessage, opened: Opened) =>
  ThreadMessage.Author.match(message.author, {
    Member: ({ memberId }) => memberName(memberId, opened),
    Contact: () => "A contact"
  })

const textOf = (message: ThreadMessage.ThreadMessage) =>
  ThreadMessage.Content.match(message.content, { Text: ({ text }) => text, Deleted: () => "This message was deleted." })

/** A thread as its group lists it: its title, or its opening message. */
const threadLabel = ({ thread, opening }: Pick<ThreadItem, "thread" | "opening">) =>
  thread.title ?? Option.match(opening, { onNone: () => "A thread", onSome: textOf })

const sending = (pending: boolean, h: HtmlBuilder<Message>): Html => (pending ? h.span([], [" · Sending…"]) : h.empty)

const actionsView = (actions: ReadonlyArray<ActionItem>, notice: Option.Option<string>, h: HtmlBuilder<Message>) => {
  const refused = actions.flatMap((action) =>
    Option.match(action.rejection, { onNone: () => [], onSome: (why) => [{ ...action, why }] })
  )
  return h.div(
    [h.AriaLive("polite")],
    [
      Option.match(notice, { onNone: () => h.empty, onSome: (text) => h.p([h.Role("alert")], [text]) }),
      ...refused.map(({ key, what, text, why }) =>
        h.keyed("div")(
          key,
          [h.Role("alert")],
          [
            h.p([], [`Couldn't ${what}: ${why}`]),
            Option.match(text, { onNone: () => h.empty, onSome: (text) => h.blockquote([], [text]) }),
            Button.view(
              {
                onClick: Message.ClickedDismiss({ key }),
                toView: (attributes) => h.button(attributes.button, ["Dismiss"])
              },
              h
            )
          ]
        )
      )
    ]
  )
}

const button = (h: HtmlBuilder<Message>, label: string, onClick: Message) =>
  Button.view({ onClick, toView: (attributes) => h.button(attributes.button, [label]) }, h)

/** A choice of one of `members`, or none, as `none` reads. */
const memberSelect = (
  h: HtmlBuilder<Message>,
  config: Readonly<{
    id: string
    label: string
    none: string
    members: ReadonlyArray<Member.Member>
    value: Option.Option<Member.Member["id"]>
    onChange: (memberId: Option.Option<Member.Member["id"]>) => Message
  }>
) =>
  Select.view(
    {
      id: config.id,
      value: Option.getOrElse(config.value, () => ""),
      onChange: (value) =>
        config.onChange(Option.fromUndefinedOr(config.members.find((member) => member.id === value)?.id)),
      toView: (attributes) =>
        h.div(
          [],
          [
            h.label(attributes.label, [config.label]),
            h.select(attributes.select, [
              h.option([h.Value("")], [config.none]),
              ...config.members.map((member) => h.option([h.Value(member.id)], [member.name]))
            ])
          ]
        )
    },
    h
  )

/** A choice of one of `choices`, each a value and how the person reads it. */
const choiceSelect = <A extends string>(
  h: HtmlBuilder<Message>,
  config: Readonly<{
    id: string
    label: string
    choices: ReadonlyArray<readonly [A, string]>
    value: A
    onChange: (value: A) => Message
  }>
) =>
  Select.view(
    {
      id: config.id,
      value: config.value,
      onChange: (value) => config.onChange(config.choices.find(([choice]) => choice === value)?.[0] ?? config.value),
      toView: (attributes) =>
        h.div(
          [],
          [
            h.label(attributes.label, [config.label]),
            h.select(
              attributes.select,
              config.choices.map(([choice, label]) => h.option([h.Value(choice)], [label]))
            )
          ]
        )
    },
    h
  )

/** The members of the workspace other than the person, who are still members of it. */
const othersIn = (opened: Opened) =>
  opened.members
    .map(({ member }) => member)
    .filter((member) => member.id !== opened.memberId && member.status === "active")

/** The open workspace as a target of the permissions that act on it. */
const workspaceTarget = (opened: Opened) => Target.Reference.cases.Workspace.make({ workspaceId: opened.workspace.id })

/** The group `groupId` as a target of the permissions that act on it. */
const groupTarget = (opened: Opened, groupId: Group.Group["id"]) =>
  Target.Reference.cases.Group.make({ workspaceId: opened.workspace.id, groupId })

/** The thread `threadId` as a target of the permissions that act on it. */
const threadTarget = (opened: Opened, threadId: Thread.Thread["id"]) =>
  Target.Reference.cases.Thread.make({ workspaceId: opened.workspace.id, threadId })

/** The groups the person belongs to, the teams they may join, and starting a team or a conversation. */
const groupsView = (opened: Opened, h: HtmlBuilder<Message>): Html => {
  const open = ({ group, pending }: GroupItem) => [
    button(h, groupName(group, opened), Message.ClickedGroup({ groupId: group.id })),
    sending(pending, h)
  ]
  const others = opened.groups.filter(({ group }) => isJoinable(group) && !belongsTo(opened, group.id))
  return h.nav(
    [h.AriaLabel("Groups")],
    [
      h.h3([], ["Your groups"]),
      h.ul(
        [h.AriaLabel("Your groups")],
        opened.groups
          .filter(({ group }) => belongsTo(opened, group.id))
          .map((item) => h.keyed("li")(item.group.id, [], open(item)))
      ),
      others.length === 0
        ? h.empty
        : h.div(
            [],
            [
              h.h3([], ["Other teams"]),
              h.ul(
                [h.AriaLabel("Other teams")],
                others.map((item) =>
                  h.keyed("li")(
                    item.group.id,
                    [],
                    [...open(item), button(h, "Join", Message.ClickedJoin({ groupId: item.group.id }))]
                  )
                )
              )
            ]
          ),
      may(opened, GroupPermissions.Create, workspaceTarget(opened))
        ? button(h, "New team", Message.ClickedNewTeam())
        : h.empty,
      button(h, "New conversation", Message.ClickedNewDirect())
    ]
  )
}

/** The form for what the person is starting: a team, or a conversation with another member. */
const composingView = (composing: Composing, opened: Opened, h: HtmlBuilder<Message>): Html =>
  Composing.match(composing, {
    Team: ({ name, isPublic }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedTeam()), h.AriaLabel("New team")],
        [
          field(
            h,
            {
              id: "team-name",
              label: "Team name",
              type: "text",
              value: name,
              onInput: (name) => Message.TypedTeamName({ name })
            },
            Option.none()
          ),
          Checkbox.view(
            {
              id: "team-public",
              isChecked: isPublic,
              onToggle: (isPublic) => Message.ToggledTeamPublic({ isPublic }),
              toView: (attributes) =>
                h.div(
                  [],
                  [
                    h.button(attributes.checkbox, [isPublic ? "✓" : ""]),
                    h.label(attributes.label, ["Anyone in the workspace can join"])
                  ]
                )
            },
            h
          ),
          submit(h, "Create team"),
          button(h, "Cancel", Message.ClickedCancelCompose())
        ]
      ),
    Direct: ({ memberId, text }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedDirect()), h.AriaLabel("New conversation")],
        [
          memberSelect(h, {
            id: "direct-member",
            label: "With",
            none: "Choose a member",
            members: othersIn(opened),
            value: memberId,
            onChange: (memberId) => Message.ChoseDirectMember({ memberId })
          }),
          textarea(h, {
            id: "direct-text",
            label: "Message",
            value: text,
            onInput: (text) => Message.TypedDirect({ text })
          }),
          submit(h, "Start conversation"),
          button(h, "Cancel", Message.ClickedCancelCompose())
        ]
      )
  })

/** The person's follow of the group: following it, or not, and whether a change to that is on its way. */
const groupFollowView = (groupId: Group.Group["id"], opened: Opened, h: HtmlBuilder<Message>): Html => {
  const own = opened.follows.filter(({ follow }) => follow.groupId === groupId && follow.memberId === opened.memberId)
  return own.some(({ pending }) => pending)
    ? h.span([], ["Updating…"])
    : own.some(({ follow }) => follow.status === "active")
      ? button(h, "Unfollow", Message.ClickedUnfollowGroup())
      : button(h, "Follow", Message.ClickedFollowGroup())
}

/**
 * The group's name, the form to change a team's while the person renames it, and their part in it:
 * following it and leaving it while they belong to it, or joining a team they may join.
 */
const groupHeaderView = (group: OpenGroup, found: GroupItem | undefined, opened: Opened, h: HtmlBuilder<Message>) => {
  const isTeam = found?.group.kind === "Team"
  const isMember = belongsTo(opened, group.groupId)
  return h.header(
    [],
    [
      Option.match(group.renaming, {
        onNone: () =>
          h.div(
            [],
            [
              h.h3([], [found === undefined ? "A group" : groupName(found.group, opened)]),
              isTeam && isMember && may(opened, GroupPermissions.Rename, groupTarget(opened, group.groupId))
                ? button(h, "Rename", Message.ClickedRenameGroup())
                : h.empty
            ]
          ),
        onSome: (draft) =>
          h.form(
            [h.OnSubmit(Message.SubmittedGroupName())],
            [
              field(
                h,
                {
                  id: "group-name",
                  label: "Name",
                  type: "text",
                  value: draft,
                  onInput: (name) => Message.TypedGroupName({ name })
                },
                Option.none()
              ),
              submit(h, "Save"),
              button(h, "Cancel", Message.ClickedCancelGroupName())
            ]
          )
      }),
      isMember ? groupFollowView(group.groupId, opened, h) : h.empty,
      isMember
        ? isTeam && !Group.isGeneral({ id: group.groupId })
          ? button(h, "Leave", Message.ClickedLeave())
          : h.empty
        : found !== undefined && isJoinable(found.group)
          ? button(h, "Join", Message.ClickedJoin({ groupId: group.groupId }))
          : h.empty
    ]
  )
}

/**
 * A team's members, and for a member of it who may manage them, removing them and admitting
 * another member, except to general, which every member belongs to.
 */
const membersView = (group: OpenGroup, opened: Opened, h: HtmlBuilder<Message>): Html => {
  const admitted = opened.memberships.filter(
    ({ membership }) => membership.groupId === group.groupId && membership.status === "active"
  )
  const isManaged =
    belongsTo(opened, group.groupId) &&
    !Group.isGeneral({ id: group.groupId }) &&
    may(opened, GroupMembershipPermissions.Manage, groupTarget(opened, group.groupId))
  const admissible = othersIn(opened).filter(
    (member) => !admitted.some(({ membership }) => membership.memberId === member.id)
  )
  return h.section(
    [h.AriaLabel("Members")],
    [
      h.h4([], ["Members"]),
      h.ul(
        [],
        admitted.map(({ membership, pending }) =>
          h.keyed("li")(
            membership.id,
            [],
            [
              memberName(membership.memberId, opened),
              sending(pending, h),
              !isManaged || pending || membership.memberId === opened.memberId
                ? h.empty
                : button(h, "Remove", Message.ClickedRemoveGroupMember({ membershipId: membership.id }))
            ]
          )
        )
      ),
      !isManaged || admissible.length === 0
        ? h.empty
        : h.form(
            [h.OnSubmit(Message.SubmittedAddGroupMember())],
            [
              memberSelect(h, {
                id: "add-member",
                label: "Add a member",
                none: "Choose a member",
                members: admissible,
                value: group.adding,
                onChange: (memberId) => Message.ChoseGroupMemberToAdd({ memberId })
              }),
              submit(h, "Add")
            ]
          )
    ]
  )
}

/** The person's part in the thread: following it, or not, and whether a change to that is on its way. */
const followView = (following: Option.Option<Following>, h: HtmlBuilder<Message>): Html =>
  Option.match(following, {
    onNone: () => button(h, "Follow", Message.ClickedFollow()),
    onSome: ({ active, pending }) =>
      pending
        ? h.span([], ["Updating…"])
        : active
          ? button(h, "Unfollow", Message.ClickedUnfollow())
          : button(h, "Follow", Message.ClickedFollow())
  })

/** The thread's title, and the form to change it while the person renames it. */
const titleView = (thread: OpenThread, title: string, h: HtmlBuilder<Message>): Html =>
  Option.match(thread.renaming, {
    onNone: () => h.div([], [h.h4([], [title]), button(h, "Rename", Message.ClickedRename())]),
    onSome: (draft) =>
      h.form(
        [h.OnSubmit(Message.SubmittedRename())],
        [
          field(
            h,
            {
              id: "title",
              label: "Title",
              type: "text",
              value: draft,
              onInput: (title) => Message.TypedTitle({ title })
            },
            Option.none()
          ),
          submit(h, "Save"),
          button(h, "Cancel", Message.ClickedCancelRename())
        ]
      )
  })

/** A message, with editing and deleting for the person's own, and the form to change it while they edit it. */
const messageView = (
  { message, pending }: MessageItem,
  thread: OpenThread,
  opened: Opened,
  h: HtmlBuilder<Message>
): Html => {
  const own =
    ThreadMessage.Author.matchOrElse(
      message.author,
      { Member: ({ memberId }) => memberId === opened.memberId },
      () => false
    ) && ThreadMessage.Content.matchOrElse(message.content, { Text: () => true }, () => false)
  const editing = Option.filter(thread.editing, ({ messageId }) => messageId === message.id)
  const edited = ThreadMessage.Content.matchOrElse(
    message.content,
    { Text: ({ editedAt }) => editedAt !== null },
    () => false
  )
  return h.keyed("li")(
    message.id,
    [],
    [
      h.p(
        [],
        [h.strong([], [authorName(message, opened)]), sending(pending, h), edited ? h.span([], [" · edited"]) : h.empty]
      ),
      Option.match(editing, {
        onSome: ({ draft }) =>
          h.form(
            [h.OnSubmit(Message.SubmittedEdit())],
            [
              textarea(h, { id: "edit", label: "Edit", value: draft, onInput: (text) => Message.TypedEdit({ text }) }),
              submit(h, "Save"),
              button(h, "Cancel", Message.ClickedCancelEdit())
            ]
          ),
        onNone: () =>
          h.div(
            [],
            [
              h.p([], [textOf(message)]),
              ...(own && !pending
                ? [
                    button(h, "Edit", Message.ClickedEdit({ messageId: message.id })),
                    button(h, "Delete", Message.ClickedDelete({ messageId: message.id }))
                  ]
                : [])
            ]
          )
      })
    ]
  )
}

const statusLabels: Readonly<Record<Task.Status, string>> = {
  triage: "Triage",
  todo: "To do",
  doing: "Doing",
  held: "On hold",
  done: "Done",
  dismissed: "Dismissed"
}

const priorityLabels: Readonly<Record<Task.Priority, string>> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent"
}

/**
 * Whom the person may assign a task in `groupId` to: the group's members, and among them only the
 * agents the person may direct, since assigning one directs it.
 */
const assignableIn = (opened: Opened, groupId: Group.Group["id"]) =>
  opened.members
    .map(({ member }) => member)
    .filter(
      (member) =>
        member.status === "active" &&
        opened.memberships.some(
          ({ membership }) =>
            membership.groupId === groupId && membership.memberId === member.id && membership.status === "active"
        ) &&
        (Identity.MemberReference.isAnyOf(["Human"])(member.identity) ||
          may(
            opened,
            AgentPermissions.Use,
            Target.Reference.cases.Member.make({ workspaceId: opened.workspace.id, memberId: member.id })
          ))
    )

/**
 * The task the thread tracks: its status, priority, and assignee, which the person changes when they
 * may; or, while it tracks none, making it one, when they may create tasks in its group.
 */
const taskView = (thread: OpenThread, group: OpenGroup, opened: Opened, h: HtmlBuilder<Message>): Html =>
  Option.match(thread.task, {
    onNone: () =>
      may(opened, TaskPermissions.Create, groupTarget(opened, group.groupId))
        ? button(h, "Make it a task", Message.ClickedMakeTask())
        : h.empty,
    onSome: ({ task, pending }) =>
      h.section(
        [h.AriaLabel("Task")],
        [
          h.p([], [h.strong([], ["Task"]), sending(pending, h)]),
          may(opened, TaskPermissions.Update, threadTarget(opened, thread.threadId))
            ? h.div(
                [],
                [
                  choiceSelect(h, {
                    id: "task-status",
                    label: "Status",
                    choices: Task.Status.literals.map((status) => [status, statusLabels[status]] as const),
                    value: task.status,
                    onChange: (status) => Message.ChoseTaskStatus({ status })
                  }),
                  choiceSelect(h, {
                    id: "task-priority",
                    label: "Priority",
                    choices: Task.Priority.literals.map((priority) => [priority, priorityLabels[priority]] as const),
                    value: task.priority,
                    onChange: (priority) => Message.ChoseTaskPriority({ priority })
                  }),
                  memberSelect(h, {
                    id: "task-assignee",
                    label: "Assignee",
                    none: "No one",
                    members: assignableIn(opened, group.groupId),
                    value: Option.fromNullOr(task.assignee),
                    onChange: (memberId) => Message.ChoseTaskAssignee({ memberId })
                  })
                ]
              )
            : h.p(
                [],
                [
                  [
                    statusLabels[task.status],
                    priorityLabels[task.priority],
                    task.assignee === null ? "Assigned to no one" : `Assigned to ${memberName(task.assignee, opened)}`
                  ].join(" · ")
                ]
              )
        ]
      )
  })

const turnStatusLabels: Readonly<Record<Turn.Status, string>> = {
  queued: "Queued",
  running: "Running",
  cancelling: "Stopping",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Stopped"
}

/** One item of a turn's log, as the person reads it. */
const logItemText = (item: Turn.LogItem) =>
  Turn.LogItem.match(item, {
    InputTaken: ({ messages }) => `Read ${messages} ${messages === 1 ? "message" : "messages"}`,
    Responded: ({ text, reply }) => (reply ? `Replied: ${text}` : text),
    Interrupted: ({ reason }) => `Stopped short: ${reason}`
  })

/** A turn's log as the person follows it: what its agent was given, what it wrote, and where it stopped short. */
const logView = (log: TurnLog, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.AriaLabel("Log")],
    [
      h.ol(
        [],
        log.items.map((item) => h.li([], [logItemText(item)]))
      ),
      LogState.match(log.state, {
        Opening: () => h.p([], ["Opening the log…"]),
        Open: () => h.empty,
        Ended: () => h.p([], ["The turn has ended."]),
        Failed: ({ error }) =>
          h.div(
            [h.Role("alert")],
            [h.p([], [error]), button(h, "Try again", Message.ClickedShowLog({ turnId: log.turnId }))]
          )
      })
    ]
  )

/**
 * A turn: its agent and how it stands, who ran it again, why it failed; for a person who may direct
 * its agent, stopping it while it runs and running it again once it failed or stopped; and its log.
 */
const turnView = (
  { turn, pending, retryOpen }: TurnItem,
  thread: OpenThread,
  opened: Opened,
  h: HtmlBuilder<Message>
) => {
  const directs = permits(opened, Turn.directRequirement(turn))
  const followed = Option.filter(thread.log, ({ turnId }) => turnId === turn.id)
  return h.keyed("li")(
    turn.id,
    [],
    [
      h.p(
        [],
        [
          h.strong([], [memberName(turn.memberId, opened)]),
          ` · ${turnStatusLabels[turn.status]}`,
          turn.retry === null ? h.empty : h.span([], [` · run again by ${memberName(turn.retry.by, opened)}`]),
          sending(pending, h)
        ]
      ),
      turn.failure === null ? h.empty : h.p([], [turn.failure]),
      directs && Turn.stoppable(turn.status)
        ? button(h, "Stop", Message.ClickedStopTurn({ turnId: turn.id }))
        : h.empty,
      directs && retryOpen ? button(h, "Retry", Message.ClickedRetryTurn({ turnId: turn.id })) : h.empty,
      Option.match(followed, {
        onNone: () => button(h, "Show log", Message.ClickedShowLog({ turnId: turn.id })),
        onSome: (log) => h.div([], [button(h, "Hide log", Message.ClickedHideLog()), logView(log, h)])
      })
    ]
  )
}

/** The thread's turns, oldest first: each agent's work on what was asked of it there. */
const turnsView = (thread: OpenThread, opened: Opened, h: HtmlBuilder<Message>): Html =>
  thread.turns.length === 0
    ? h.empty
    : h.section(
        [h.AriaLabel("Turns")],
        [
          h.p([], [h.strong([], ["Turns"])]),
          h.ol(
            [],
            thread.turns.map((item) => turnView(item, thread, opened, h))
          )
        ]
      )

const threadView = (thread: OpenThread, group: OpenGroup, opened: Opened, h: HtmlBuilder<Message>): Html => {
  const item = group.threads.find(({ thread: listed }) => listed.id === thread.threadId)
  return h.section(
    [h.AriaLabel("Thread")],
    [
      button(h, "All threads", Message.ClickedAllThreads()),
      titleView(thread, item === undefined ? "A thread" : threadLabel(item), h),
      followView(thread.following, h),
      taskView(thread, group, opened, h),
      h.ol(
        [h.AriaLabel("Messages")],
        thread.messages.map((message) => messageView(message, thread, opened, h))
      ),
      turnsView(thread, opened, h),
      h.form(
        [h.OnSubmit(Message.SubmittedReply())],
        [
          textarea(h, {
            id: "reply",
            label: "Reply",
            value: thread.draft,
            onInput: (text) => Message.TypedReply({ text })
          }),
          submit(h, "Reply")
        ]
      )
    ]
  )
}

const groupView = (group: OpenGroup, opened: Opened, h: HtmlBuilder<Message>): Html => {
  const found = opened.groups.find((item) => item.group.id === group.groupId)
  return h.section(
    [h.AriaLabel("Group")],
    [
      groupHeaderView(group, found, opened, h),
      Option.match(group.thread, {
        onSome: (thread) => threadView(thread, group, opened, h),
        onNone: () =>
          h.div(
            [],
            [
              found?.group.kind === "Team" ? membersView(group, opened, h) : h.empty,
              belongsTo(opened, group.groupId)
                ? threadsView(group, h)
                : h.p([], ["Join this team to read its threads."])
            ]
          )
      })
    ]
  )
}

/** The group's threads, and the form to start one. */
const threadsView = (group: OpenGroup, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      group.threads.length === 0
        ? h.p([], ["No threads yet."])
        : h.ul(
            [h.AriaLabel("Threads")],
            group.threads.map((item) =>
              h.keyed("li")(
                item.thread.id,
                [],
                [
                  Button.view(
                    {
                      onClick: Message.ClickedThread({ threadId: item.thread.id }),
                      toView: (attributes) => h.button(attributes.button, [threadLabel(item)])
                    },
                    h
                  ),
                  Option.match(item.task, {
                    onNone: () => h.empty,
                    onSome: (task) => h.span([], [` · ${statusLabels[task.status]}`])
                  }),
                  sending(item.pending, h),
                  item.unread > 0 ? h.span([], [` · ${item.unread} new`]) : h.empty
                ]
              )
            )
          ),
      h.form(
        [h.OnSubmit(Message.SubmittedThread())],
        [
          textarea(h, {
            id: "thread",
            label: "Start a thread",
            value: group.draft,
            onInput: (text) => Message.TypedThread({ text })
          }),
          submit(h, "Start")
        ]
      )
    ]
  )

/** A choice of one of `roles`. */
const roleSelect = (
  h: HtmlBuilder<Message>,
  config: Readonly<{
    id: string
    label: string
    roles: ReadonlyArray<Role.Role>
    value: Role.Role["id"] | undefined
    onChange: (roleId: Role.Role["id"]) => Message
  }>
) =>
  Select.view(
    {
      id: config.id,
      value: config.value ?? "",
      onChange: (value) => config.onChange(config.roles.find((role) => role.id === value)?.id ?? BuiltinRoles.MemberId),
      toView: (attributes) =>
        h.div(
          [],
          [
            h.label(attributes.label, [config.label]),
            h.select(
              attributes.select,
              config.roles.map((role) => h.option([h.Value(role.id)], [role.name]))
            )
          ]
        )
    },
    h
  )

/** A name the person may change, and the form to change it while they do. */
const renamable = (
  h: HtmlBuilder<Message>,
  config: Readonly<{
    id: string
    label: string
    name: string
    pending: boolean
    draft: Option.Option<string>
    mayRename: boolean
    renameLabel: string
    onRename: Message
    onInput: (name: string) => Message
    onSubmit: Message
    onCancel: Message
  }>
): Html =>
  Option.match(config.draft, {
    onNone: () =>
      h.p(
        [],
        [
          config.name,
          sending(config.pending, h),
          config.mayRename ? button(h, config.renameLabel, config.onRename) : h.empty
        ]
      ),
    onSome: (draft) =>
      h.form(
        [h.OnSubmit(config.onSubmit)],
        [
          field(
            h,
            { id: config.id, label: config.label, type: "text", value: draft, onInput: config.onInput },
            Option.none()
          ),
          submit(h, "Save"),
          button(h, "Cancel", config.onCancel)
        ]
      )
  })

/**
 * The workspace's members, with their roles, and for each the person may act on, changing their
 * role and removing them; and for the owner, handing the workspace to another person.
 */
const workspaceMembersView = (opened: Opened, h: HtmlBuilder<Message>): Html => {
  const mayChangeRoles = may(opened, AssignmentPermissions.Manage, workspaceTarget(opened))
  const mayTransfer = isOwner(opened) && may(opened, OwnershipPermissions.Transfer, workspaceTarget(opened))
  const roles = givableRoles(opened)
  return h.section(
    [h.AriaLabel("Workspace members")],
    [
      h.h4([], ["Members"]),
      h.ul(
        [],
        opened.members
          .filter(({ member }) => member.status === "active")
          .map(({ member, pending }) => {
            const held = workspaceRolesOf(opened, member.id)
            const changing = opened.assignments.some((item) => item.pending && item.assignment.memberId === member.id)
            const mayActOnThem = member.id !== opened.memberId && mayActOn(opened, member.id)
            const memberTarget = Target.Reference.cases.Member.make({
              workspaceId: opened.workspace.id,
              memberId: member.id
            })
            return h.keyed("li")(
              member.id,
              [],
              [
                h.span([], [member.name]),
                h.span(
                  [],
                  held.map(
                    (assignment) =>
                      ` · ${opened.roles.find((role) => role.id === assignment.source.roleId)?.name ?? "A role"}`
                  )
                ),
                sending(pending || changing, h),
                mayActOnThem && mayChangeRoles && held.length <= 1
                  ? roleSelect(h, {
                      id: `role-${member.id}`,
                      label: `Role of ${member.name}`,
                      roles,
                      value: held[0]?.source.roleId,
                      onChange: (roleId) => Message.ChoseRole({ memberId: member.id, roleId })
                    })
                  : h.empty,
                mayActOnThem && may(opened, MemberPermissions.Remove, memberTarget)
                  ? button(h, "Remove", Message.ClickedRemoveMember({ memberId: member.id }))
                  : h.empty,
                mayTransfer &&
                member.id !== opened.memberId &&
                Identity.MemberReference.isAnyOf(["Human"])(member.identity)
                  ? button(h, "Make owner", Message.ClickedTransferOwnership({ memberId: member.id }))
                  : h.empty
              ]
            )
          })
      )
    ]
  )
}

/** The invitations still to be accepted, those on their way, and the form to invite someone by address. */
const invitationsView = (settings: Settings, opened: Opened, h: HtmlBuilder<Message>): Html => {
  const issuing = opened.actions.filter(({ tag, rejection }) => tag === "InvitationIssued" && Option.isNone(rejection))
  const open = opened.invitations.filter(({ invitation }) => Invitation.State.isAnyOf(["Pending"])(invitation.state))
  return h.section(
    [h.AriaLabel("Invitations")],
    [
      h.h4([], ["Invitations"]),
      issuing.length + open.length === 0
        ? h.p([], ["No invitations waiting."])
        : h.ul(
            [],
            [
              ...issuing.map(({ key, text }) =>
                h.keyed("li")(key, [], [Option.getOrElse(text, () => "Someone"), sending(true, h)])
              ),
              ...open.map(({ invitation: { details }, pending }) =>
                h.keyed("li")(
                  details.id,
                  [],
                  [
                    `${details.recipientEmail} · ${opened.roles.find((role) => role.id === details.roleId)?.name ?? "A role"}, until ${DateTime.formatIsoDateUtc(details.expiresAt)}`,
                    sending(pending, h),
                    pending
                      ? h.empty
                      : button(h, "Revoke", Message.ClickedRevokeInvitation({ invitationId: details.id }))
                  ]
                )
              )
            ]
          ),
      h.form(
        [h.OnSubmit(Message.SubmittedInvite()), h.AriaLabel("Invite someone")],
        [
          field(
            h,
            {
              id: "invite-email",
              label: "Email",
              type: "email",
              value: settings.inviting.email,
              onInput: (email) => Message.TypedInviteEmail({ email })
            },
            Option.none()
          ),
          roleSelect(h, {
            id: "invite-role",
            label: "Role",
            roles: givableRoles(opened),
            value: settings.inviting.roleId,
            onChange: (roleId) => Message.ChoseInviteRole({ roleId })
          }),
          submit(h, "Invite")
        ]
      )
    ]
  )
}

/** Whether a notification still waits for the person to see it. */
const isWaiting = ({ notification }: InboxItem) => Notification.State.isAnyOf(["Pending"])(notification.state)

/** What a notification tells the person: who wrote the message it is about, and in which thread, as its group lists it. */
const inboxLabel = (item: InboxItem, opened: Opened) => {
  const where = (thread: Thread.Thread) => {
    const group = opened.groups.find(({ group }) => group.id === thread.groupId)
    const label = threadLabel({ thread, opening: item.opening })
    return `${label}${group === undefined ? "" : ` in ${groupName(group.group, opened)}`}`
  }
  const what = Option.match(item.message, {
    onNone: () => "New activity",
    onSome: (message) => `${authorName(message, opened)}: ${textOf(message)}`
  })
  return Option.match(item.thread, { onNone: () => what, onSome: (thread) => `${what} · ${where(thread)}` })
}

/** The notifications still waiting for the person, newest first, to open, or to mark seen one or all at once. */
const inboxView = (opened: Opened, h: HtmlBuilder<Message>): Html => {
  const waiting = opened.inbox
    .filter(isWaiting)
    .toSorted((left, right) => DateTime.Order(right.notification.recordedAt, left.notification.recordedAt))
  return h.section(
    [h.AriaLabel("Inbox")],
    [
      h.h3([], ["Inbox"]),
      waiting.length === 0
        ? h.p([], ["Nothing new."])
        : h.div(
            [],
            [
              button(h, "Mark all seen", Message.ClickedMarkAllSeen()),
              h.ul(
                [h.AriaLabel("Notifications")],
                waiting.map((item) =>
                  h.keyed("li")(
                    item.notification.id,
                    [],
                    [
                      h.p([], [inboxLabel(item, opened)]),
                      item.notification.thread === undefined
                        ? h.empty
                        : button(h, "Open", Message.ClickedNotification({ notificationId: item.notification.id })),
                      button(h, "Mark seen", Message.ClickedMarkSeen({ notificationId: item.notification.id }))
                    ]
                  )
                )
              )
            ]
          )
    ]
  )
}

/** The workspace's settings: its name, the person's own, its members and their roles, and its invitations. */
const settingsView = (settings: Settings, opened: Opened, h: HtmlBuilder<Message>): Html => {
  const self = opened.members.find(({ member }) => member.id === opened.memberId)
  return h.section(
    [h.AriaLabel("Settings")],
    [
      h.h3([], ["Settings"]),
      h.h4([], ["Workspace name"]),
      renamable(h, {
        id: "workspace-name",
        label: "Workspace name",
        name: opened.workspace.name,
        pending: opened.workspacePending,
        draft: settings.workspaceName,
        mayRename: may(opened, WorkspaceSettingsPermissions.Rename, workspaceTarget(opened)),
        renameLabel: "Rename workspace",
        onRename: Message.ClickedRenameWorkspace(),
        onInput: (name) => Message.TypedWorkspaceName({ name }),
        onSubmit: Message.SubmittedWorkspaceName(),
        onCancel: Message.ClickedCancelWorkspaceName()
      }),
      h.h4([], ["Your name"]),
      renamable(h, {
        id: "own-name",
        label: "Your name",
        name: self?.member.name ?? "",
        pending: self?.pending ?? false,
        draft: settings.ownName,
        mayRename: true,
        renameLabel: "Change your name",
        onRename: Message.ClickedRenameSelf(),
        onInput: (name) => Message.TypedOwnName({ name }),
        onSubmit: Message.SubmittedOwnName(),
        onCancel: Message.ClickedCancelOwnName()
      }),
      workspaceMembersView(opened, h),
      may(opened, InvitationPermissions.Manage, workspaceTarget(opened))
        ? invitationsView(settings, opened, h)
        : h.empty
    ]
  )
}

const workspaceView = (opened: Opened, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.AriaLabel(opened.workspace.name)],
    [
      h.h2([], [opened.workspace.name, sending(opened.workspacePending, h)]),
      button(h, "All workspaces", Message.ClickedAllWorkspaces()),
      button(
        h,
        opened.inbox.some(isWaiting) ? `Inbox (${opened.inbox.filter(isWaiting).length})` : "Inbox",
        Message.ClickedInbox()
      ),
      button(h, "Settings", Message.ClickedSettings()),
      StoreState.match(opened.store, {
        Opening: () => h.p([], ["Opening…"]),
        Failed: ({ error }) => h.p([h.Role("alert")], [error]),
        Open: () =>
          h.div(
            [],
            [
              actionsView(opened.actions, opened.notice, h),
              groupsView(opened, h),
              Option.match(opened.composing, {
                onNone: () => h.empty,
                onSome: (composing) => composingView(composing, opened, h)
              }),
              Option.match(opened.pane, {
                onNone: () => h.empty,
                onSome: Pane.match({
                  Group: ({ group }) => groupView(group, opened, h),
                  Inbox: () => inboxView(opened, h),
                  Settings: ({ settings }) => settingsView(settings, opened, h)
                })
              })
            ]
          )
      })
    ]
  )

const signedInView = ({ session, workspaces, opened }: SignedIn, h: HtmlBuilder<Message>): Html =>
  h.main(
    [],
    [
      h.header(
        [],
        [
          h.p([], [session.account.email]),
          Button.view(
            { onClick: Message.ClickedSignOut(), toView: (attributes) => h.button(attributes.button, ["Sign out"]) },
            h
          )
        ]
      ),
      Option.match(opened, {
        onNone: () => workspacesView(workspaces, h),
        onSome: (opened) => workspaceView(opened, h)
      })
    ]
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "amends",
  body: Page.match(model.page, {
    SignedOut: ({ form }) => h.main([], [signInView(form, h)]),
    SignedIn: (page) => signedInView(page, h)
  })
})
