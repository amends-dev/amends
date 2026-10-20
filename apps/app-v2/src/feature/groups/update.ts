import type { GroupId } from "@amends-dev/core/group"
import type { MemberId } from "@amends-dev/core/workspace"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { placeName } from "../../seen.ts"
import { CreateTeam, FocusTeamMembers, JoinGroup, StartConversation } from "./command.ts"
import { DialogBinding, GroupsComposition, MembersBinding } from "./composition.ts"
import {
  type BrowseTab,
  conversationWith,
  findCreatedTeam,
  findGroup,
  GroupsDefinition,
  isTeamReady,
  Message,
  type Model,
  OutMessage,
  onTeam,
  Starting,
  teamIn,
  type TeamForm,
  withTeam
} from "./definition.ts"

/** The model with what the person is starting as `change` makes it, while they start something. */
const atStarting = (model: Model, change: (starting: Starting) => Starting) =>
  modifyFields(model, { starting: Option.map(change) })

/** The conversation being started, with its member chosen, while one is. */
const conversationIn = (model: Model) =>
  Option.flatMap(
    model.starting,
    Starting.matchOrElse(
      { Conversation: ({ memberId, text }) => Option.map(memberId, (withMemberId) => ({ withMemberId, text })) },
      () => Option.none()
    )
  )

/** Ask for a new team: unnamed, private, and with no one added besides the person. */
const openTeamForm = GroupsDefinition.stepFields(() => ({
  starting: () =>
    Option.some(
      Starting.Team({
        name: "",
        visibility: "Private",
        memberIds: [],
        creating: Option.none(),
        failure: Option.none()
      })
    )
}))

/** Ask for a new conversation with `memberId` chosen, or with none chosen, and no first message. */
const openConversationForm = (memberId: Option.Option<MemberId.MemberId>) =>
  GroupsDefinition.stepFields(() => ({
    starting: () => Option.some(Starting.Conversation({ memberId, text: "" }))
  }))

/**
 * Picking the group already picked changes nothing; any other is marked and reported, as a click on its row
 * does.
 */
const pickGroup = (model: Model, groupId: GroupId.GroupId) =>
  Option.contains(model.selected, groupId)
    ? { model }
    : {
        model: modifyFields(model, { selected: () => Option.some(groupId) }),
        outMessage: OutMessage.SelectedGroup({ groupId })
      }

/** Ask to browse the groups, on the tab `tab`. */
const browseOn = (model: Model, tab: BrowseTab) => ({
  model: modifyFields(model, { browse: (browse) => modifyFields(browse, { tab: () => tab }) }),
  outMessage: OutMessage.RequestedBrowse()
})

/** The model without `groupId` among the teams being joined, once the join is written or could not be. */
const joined = (model: Model, groupId: GroupId.GroupId) =>
  modifyFields(model, { joining: (joining) => joining.filter((id) => id !== groupId) })

/** Join the public team `groupId`, which is being joined until the action is written, unless it already is. */
const joinGroup = (model: Model, groupId: GroupId.GroupId) =>
  model.joining.includes(groupId)
    ? { model }
    : {
        model: modifyFields(model, { joining: (joining) => [...joining, groupId], notice: () => Option.none() }),
        commands: [JoinGroup({ workspaceId: model.workspaceId, memberId: model.memberId, groupId })]
      }

/** Tell the parent the person joined `groupId`, where it is as a line says it, when the Block can still see it. */
const reportJoined = (model: Model, groupId: GroupId.GroupId) => {
  const next = joined(model, groupId)

  return Option.match(findGroup(model, groupId), {
    onNone: () => ({ model: next }),
    onSome: ({ group }) => ({
      model: next,
      outMessage: OutMessage.JoinedGroup({ groupId, place: placeName(group, model.members, model.memberId) })
    })
  })
}

/**
 * Write the team of `team` to the person's store, as the person's own first member with the people they added: until
 * the team is listed, the form shows the attempt and cannot be sent again.
 */
const createTeam = (model: Model, team: TeamForm) => {
  const name = team.name.trim()

  return {
    model: withTeam(model, (form) => ({
      ...form,
      failure: Option.none(),
      creating: Option.some({ name, knownGroupIds: model.groups.map(({ group }) => group.id), isWritten: false })
    })),
    commands: [
      CreateTeam({
        workspaceId: model.workspaceId,
        memberId: model.memberId,
        name,
        visibility: team.visibility,
        memberIds: [model.memberId, ...team.memberIds]
      })
    ]
  }
}

/** Write the conversation with `withMemberId`, `text` its first message, to the person's store. */
const writeConversation = (withMemberId: MemberId.MemberId, text: string) =>
  GroupsDefinition.step((model: Model) => ({
    model,
    commands: [StartConversation({ workspaceId: model.workspaceId, memberId: model.memberId, withMemberId, text })]
  }))

export const update = GroupsComposition.makeUpdate((model, message) => {
  /**
   * Finish creating a team once the store has kept the action and has listed the team it made: mark it in the sidebar,
   * close the dialog, and report it, for the page to open and confirm.
   */
  const finishCreating = (current: typeof model) =>
    Option.match(findCreatedTeam(current), {
      onNone: () => ({ model: current }),
      onSome: ({ group }) =>
        pipe(
          Update.combine(current, [
            GroupsDefinition.stepFields(() => ({ selected: () => Option.some(group.id) })),
            DialogBinding.requestClose()
          ]),
          Update.withOutMessage(OutMessage.CreatedGroup({ groupId: group.id }))
        )
    })

  return Message.match(message, {
    ReceivedGroups: ({ groups, members, memberships, grants }) =>
      finishCreating(
        modifyFields(model, {
          isLoaded: () => true,
          groups: () => groups,
          members: () => members,
          memberships: () => memberships,
          grants: () => grants
        })
      ),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedTryAgain: () => ({
      model: modifyFields(model, { notice: () => Option.none(), reads: (reads) => reads + 1 })
    }),
    ClickedGroup: ({ groupId }) => pickGroup(model, groupId),
    InformedOfOpenGroup: ({ groupId }) => ({ model: modifyFields(model, { selected: () => groupId }) }),
    ClickedGroupsTitle: () => browseOn(model, "Yours"),
    ClickedBrowse: () => browseOn(model, "Discover"),
    ChoseBrowseTab: ({ tab }) => ({
      model: modifyFields(model, { browse: (browse) => modifyFields(browse, { tab: () => tab }) })
    }),
    TypedBrowseQuery: ({ query }) => ({
      model: modifyFields(model, { browse: (browse) => modifyFields(browse, { query: () => query }) })
    }),
    ClickedJoin: ({ groupId }) => joinGroup(model, groupId),
    SucceededJoinGroup: ({ groupId }) => reportJoined(model, groupId),
    FailedJoinGroup: ({ groupId, error }) => ({
      model: modifyFields(joined(model, groupId), { notice: () => Option.some(error) })
    }),
    ClickedNewTeam: () =>
      Update.combine(model, [openTeamForm, MembersBinding.requestClose(), DialogBinding.requestOpen()]),
    TypedTeamName: ({ name }) => ({ model: withTeam(model, (team) => ({ ...team, name })) }),
    ClickedRemoveTeamMember: ({ memberId }) => ({
      model: withTeam(model, (team) => ({
        ...team,
        memberIds: team.memberIds.filter((id) => id !== memberId)
      })),
      commands: [FocusTeamMembers({})]
    }),
    SubmittedTeam: () =>
      Option.match(teamIn(model), {
        onNone: () => ({ model }),
        onSome: (team) => (isTeamReady(team) ? createTeam(model, team) : { model })
      }),
    SucceededCreateTeam: () =>
      finishCreating(
        modifyFields(model, {
          starting: onTeam((team) => ({
            ...team,
            creating: Option.map(team.creating, (creating) => ({ ...creating, isWritten: true }))
          }))
        })
      ),
    FailedCreateTeam: ({ error }) => ({
      model: withTeam(model, (team) => ({ ...team, creating: Option.none(), failure: Option.some(error) }))
    }),
    CompletedFocusTeamMembers: () => ({ model }),
    ClickedNewConversation: () =>
      Update.combine(model, [openConversationForm(Option.none()), DialogBinding.requestOpen()]),
    RequestedConversationWith: ({ memberId }) =>
      Option.match(conversationWith(model, memberId), {
        onSome: ({ group }) => pickGroup(model, group.id),
        onNone: () => Update.combine(model, [openConversationForm(Option.some(memberId)), DialogBinding.requestOpen()])
      }),
    ChoseConversationMember: ({ memberId: chosen }) => ({
      model: atStarting(
        model,
        Starting.matchOrElse(
          { Conversation: (conversation) => Starting.Conversation({ ...conversation, memberId: chosen }) },
          (same) => same
        )
      )
    }),
    TypedConversationText: ({ text }) => ({
      model: atStarting(
        model,
        Starting.matchOrElse(
          { Conversation: (conversation) => Starting.Conversation({ ...conversation, text }) },
          (same) => same
        )
      )
    }),
    SubmittedConversation: () =>
      Option.match(conversationIn(model), {
        onNone: () => ({ model }),
        onSome: ({ withMemberId, text }) =>
          Update.combine(model, [writeConversation(withMemberId, text), DialogBinding.requestClose()])
      }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
})
