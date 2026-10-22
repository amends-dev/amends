import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { Integrations } from "../../data/connections.ts"
import { CreateChannel, RedirectChannel, RemoveChannel } from "./command.ts"
import { ChannelsComposition } from "./composition.ts"
import { findChannel, Form, Message, type Model, OutMessage, whatFormLacks } from "./definition.ts"

/** The model with the form open as `change` makes it, while one is open. */
const atForm = (model: Model, change: (form: Form) => Form): Model => modifyFields(model, { form: Option.map(change) })

/** `form` with why it was refused. */
const refused = (form: Form, error: string): Form =>
  Form.match(form, {
    Adding: (adding) => Form.Adding({ ...adding, error: Option.some(error) }),
    Redirecting: (redirecting) => Form.Redirecting({ ...redirecting, error: Option.some(error) })
  })

/** Send the form open as an action and close it, or say what it still wants. */
const submitForm = (model: Model, form: Form) => {
  const { workspaceId, memberId } = model
  return Option.match(whatFormLacks(model, form), {
    onSome: (error) => ({ model: atForm(model, (open) => refused(open, error)) }),
    onNone: () => {
      const closed = modifyFields(model, { form: () => Option.none() })
      return Form.match(form, {
        Adding: ({ connectionId, groupId, name, opensTasks }) => ({
          model: closed,
          commands: [CreateChannel({ workspaceId, memberId, connectionId, groupId, name, opensTasks })]
        }),
        Redirecting: ({ channelId, groupId }) => ({
          model: closed,
          commands: [RedirectChannel({ workspaceId, memberId, channelId, groupId })]
        })
      })
    }
  })
}

export const update = ChannelsComposition.makeUpdate((model, message) => {
  const { workspaceId, memberId } = model
  return Message.match(message, {
    ReceivedChannels: ({ channels }) => ({
      model: modifyFields(model, {
        channels: () => channels,
        // A form about a channel no longer there, as one removed, closes.
        form: Option.filter((form) =>
          Form.matchOrElse(
            form,
            { Redirecting: ({ channelId }) => channels.some(({ channel }) => channel.id === channelId) },
            () => true
          )
        )
      })
    }),
    ReceivedConnections: ({ connections }) => ({ model: modifyFields(model, { connections: () => connections }) }),
    ReceivedGroups: ({ groups }) => ({ model: modifyFields(model, { groups: () => groups }) }),
    ReceivedMemberships: ({ memberships }) => ({ model: modifyFields(model, { memberships: () => memberships }) }),
    ReceivedMembers: ({ members }) => ({ model: modifyFields(model, { members: () => members }) }),
    ReceivedGrants: ({ grants }) => ({ model: modifyFields(model, { grants: () => grants }) }),
    ReceivedIntegrations: ({ integrations }) => ({
      model: modifyFields(model, { integrations: () => Integrations.cases.Loaded.make({ integrations }) })
    }),
    FailedLoadIntegrations: ({ error }) => ({
      model: modifyFields(model, { integrations: () => Integrations.cases.Failed.make({ error }) })
    }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedReloadIntegrations: () =>
      Integrations.isAnyOf(["Failed"])(model.integrations)
        ? {
            model: modifyFields(model, { integrations: () => Integrations.cases.Loading.make({}) }),
            outMessage: OutMessage.RequestedIntegrations()
          }
        : { model },
    ClickedAdd: () => ({
      model: modifyFields(model, {
        form: () =>
          Option.some(Form.Adding({ connectionId: "", groupId: "", name: "", opensTasks: false, error: Option.none() }))
      })
    }),
    ChoseConnection: ({ connectionId }) => ({
      model: atForm(model, (form) =>
        Form.matchOrElse(
          form,
          { Adding: (adding) => Form.Adding({ ...adding, connectionId, error: Option.none() }) },
          () => form
        )
      )
    }),
    ChoseGroup: ({ groupId }) => ({
      model: atForm(model, (form) =>
        Form.match(form, {
          Adding: (adding) => Form.Adding({ ...adding, groupId, error: Option.none() }),
          Redirecting: (redirecting) => Form.Redirecting({ ...redirecting, groupId, error: Option.none() })
        })
      )
    }),
    TypedName: ({ name }) => ({
      model: atForm(model, (form) =>
        Form.matchOrElse(
          form,
          { Adding: (adding) => Form.Adding({ ...adding, name, error: Option.none() }) },
          () => form
        )
      )
    }),
    ToggledOpensTasks: ({ opensTasks }) => ({
      model: atForm(model, (form) =>
        Form.matchOrElse(form, { Adding: (adding) => Form.Adding({ ...adding, opensTasks }) }, () => form)
      )
    }),
    SubmittedForm: () =>
      Option.match(model.form, { onNone: () => ({ model }), onSome: (form) => submitForm(model, form) }),
    ClickedCancelForm: () => ({ model: modifyFields(model, { form: () => Option.none() }) }),
    ClickedRedirect: ({ channelId }) => ({
      model: modifyFields(model, {
        form: () =>
          Option.map(findChannel(model, channelId), ({ channel }) =>
            Form.Redirecting({ channelId, groupId: channel.groupId, error: Option.none() })
          )
      })
    }),
    ClickedRemove: ({ channelId }) => ({ model, commands: [RemoveChannel({ workspaceId, memberId, channelId })] }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
})
