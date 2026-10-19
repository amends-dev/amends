import type { GroupId } from "@amends-dev/core/group"
import type { MemberId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { CreateTeam, StartConversation } from "./command.ts"
import { DialogBinding, GroupsComposition } from "./composition.ts"
import { conversationWith, GroupsDefinition, Message, type Model, OutMessage, Starting } from "./definition.ts"

/** The model with what the person is starting as `change` makes it, while they start something. */
const atStarting = (model: Model, change: (starting: Starting) => Starting) =>
  modifyFields(model, { starting: Option.map(change) })

/** The team being started, while one is. */
const teamIn = (model: Model) =>
  Option.flatMap(
    model.starting,
    Starting.matchOrElse({ Team: (team) => Option.some(team) }, () => Option.none())
  )

/** The conversation being started, with its member chosen, while one is. */
const conversationIn = (model: Model) =>
  Option.flatMap(
    model.starting,
    Starting.matchOrElse(
      { Conversation: ({ memberId, text }) => Option.map(memberId, (withMemberId) => ({ withMemberId, text })) },
      () => Option.none()
    )
  )

/** Ask for a new team: unnamed, and private. */
const openTeamForm = GroupsDefinition.stepFields(() => ({
  starting: () => Option.some(Starting.Team({ name: "", isPublic: false }))
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

/** Write the team `name`, public when `isPublic`, to the person's store. */
const writeTeam = (name: string, isPublic: boolean) =>
  GroupsDefinition.step((model: Model) => ({
    model,
    commands: [CreateTeam({ workspaceId: model.workspaceId, memberId: model.memberId, name, isPublic })]
  }))

/** Write the conversation with `withMemberId`, `text` its first message, to the person's store. */
const writeConversation = (withMemberId: MemberId.MemberId, text: string) =>
  GroupsDefinition.step((model: Model) => ({
    model,
    commands: [StartConversation({ workspaceId: model.workspaceId, memberId: model.memberId, withMemberId, text })]
  }))

export const update = GroupsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedGroups: ({ groups }) => ({ model: modifyFields(model, { groups: () => groups }) }),
    ReceivedMembers: ({ members }) => ({ model: modifyFields(model, { members: () => members }) }),
    ReceivedMemberships: ({ memberships }) => ({ model: modifyFields(model, { memberships: () => memberships }) }),
    ReceivedGrants: ({ grants }) => ({ model: modifyFields(model, { grants: () => grants }) }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedGroup: ({ groupId }) => pickGroup(model, groupId),
    InformedOfOpenGroup: ({ groupId }) => ({ model: modifyFields(model, { selected: () => groupId }) }),
    ClickedBrowse: () => ({ model, outMessage: OutMessage.RequestedBrowse() }),
    ChoseBrowseTab: ({ tab }) => ({
      model: modifyFields(model, { browse: (browse) => modifyFields(browse, { tab: () => tab }) })
    }),
    TypedBrowseQuery: ({ query }) => ({
      model: modifyFields(model, { browse: (browse) => modifyFields(browse, { query: () => query }) })
    }),
    ClickedNewTeam: () => Update.combine(model, [openTeamForm, DialogBinding.requestOpen()]),
    TypedTeamName: ({ name }) => ({
      model: atStarting(
        model,
        Starting.matchOrElse({ Team: (team) => Starting.Team({ ...team, name }) }, (same) => same)
      )
    }),
    ToggledTeamPublic: ({ isPublic }) => ({
      model: atStarting(
        model,
        Starting.matchOrElse({ Team: (team) => Starting.Team({ ...team, isPublic }) }, (same) => same)
      )
    }),
    SubmittedTeam: () =>
      Option.match(teamIn(model), {
        onNone: () => ({ model }),
        onSome: ({ name, isPublic }) => Update.combine(model, [writeTeam(name, isPublic), DialogBinding.requestClose()])
      }),
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
)
