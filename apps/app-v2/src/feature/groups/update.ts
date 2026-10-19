import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { CreateTeam, StartConversation } from "./command.ts"
import { GroupsComposition } from "./composition.ts"
import { Message, type Model, OutMessage, Starting } from "./definition.ts"

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

export const update = GroupsComposition.makeUpdate((model, message) => {
  const { workspaceId, memberId } = model
  return Message.match(message, {
    ReceivedGroups: ({ groups }) => ({ model: modifyFields(model, { groups: () => groups }) }),
    ReceivedMembers: ({ members }) => ({ model: modifyFields(model, { members: () => members }) }),
    ReceivedMemberships: ({ memberships }) => ({ model: modifyFields(model, { memberships: () => memberships }) }),
    ReceivedGrants: ({ grants }) => ({ model: modifyFields(model, { grants: () => grants }) }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    // Picking the group already picked changes nothing.
    ClickedGroup: ({ groupId }) =>
      Option.contains(model.selected, groupId)
        ? { model }
        : {
            model: modifyFields(model, { selected: () => Option.some(groupId) }),
            outMessage: OutMessage.SelectedGroup({ groupId })
          },
    InformedOfOpenGroup: ({ groupId }) => ({ model: modifyFields(model, { selected: () => groupId }) }),
    ClickedNewTeam: () => ({
      model: modifyFields(model, { starting: () => Option.some(Starting.Team({ name: "", isPublic: false })) })
    }),
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
        onSome: ({ name, isPublic }) => ({
          model: modifyFields(model, { starting: () => Option.none() }),
          commands: [CreateTeam({ workspaceId, memberId, name, isPublic })]
        })
      }),
    ClickedNewConversation: () => ({
      model: modifyFields(model, {
        starting: () => Option.some(Starting.Conversation({ memberId: Option.none(), text: "" }))
      })
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
        onSome: ({ withMemberId, text }) => ({
          model: modifyFields(model, { starting: () => Option.none() }),
          commands: [StartConversation({ workspaceId, memberId, withMemberId, text })]
        })
      }),
    ClickedCancelStarting: () => ({ model: modifyFields(model, { starting: () => Option.none() }) }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
})
