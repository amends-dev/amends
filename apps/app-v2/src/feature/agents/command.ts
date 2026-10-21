/**
 * What the person does with the workspace's agents: adding one, renaming one, changing how one
 * is set up, and removing one are actions written to their store; listing the models a connection
 * offers goes over HTTP, since no replica holds them.
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import { Agent } from "@amends-dev/core/agent"
import { Role } from "@amends-dev/core/authorization"
import { CoreError } from "@amends-dev/core/error"
import { Identity } from "@amends-dev/core/identity"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Api from "../../api.ts"
import * as Stores from "../../store/Stores.ts"
import { AgentsDefinition, Message, Reason, Written } from "./definition.ts"

const outcomes = [Message.WroteAction, Message.FailedWriteAction]

/** What the action `done` reports when the store kept it. */
const wrote = (done: Written) => Message.WroteAction({ written: done })

/** What the action `done` reports when it can't be made as entered. */
const refused = (done: Written) => Message.FailedWriteAction({ written: done, reason: Reason.Invalid() })

/** What the action `done` reports when this browser could not keep it. */
const unkept = (done: Written) => Message.FailedWriteAction({ written: done, reason: Reason.Unwritable() })

const unreachable = "The host could not be reached. Try again."

/** Why the host refused a request, as core words it, or that it could not be reached. */
const refusalOf = (error: unknown) => (Schema.is(CoreError.Rejection)(error) ? error.message : unreachable)

/** Add an agent called `name`, starting with the role `roleId`, set up as `configuration` says. */
export const CreateAgent = AgentsDefinition.command("CreateAgent", {
  args: { ...Stores.AsMember, name: Schema.String, roleId: Role.RoleId, configuration: Agent.Configuration },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ name, roleId, configuration, ...member }) => {
      const done = Written.Create({ name })
      return Stores.decoded(Agent.CreateInput, { name, roleId, ...configuration }, refused(done)).pipe(
        Effect.flatMap((input) =>
          Stores.writer(stores, wrote(done), () => unkept(done))(member, (store) => store.write("AgentCreated", input))
        ),
        Effect.catch(Effect.succeed)
      )
    }
  }
})

/** Set `agentId` up as `configuration` says, in place of how it is set up. */
export const ConfigureAgent = AgentsDefinition.command("ConfigureAgent", {
  args: { ...Stores.AsMember, agentId: Identity.AgentId, configuration: Agent.Configuration },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ agentId, configuration, ...member }) => {
      const done = Written.Configure({ agentId })
      return Stores.writer(stores, wrote(done), () => unkept(done))(member, (store) =>
        store.write("AgentConfigured", { agentId, ...configuration })
      )
    }
  }
})

/** Rename `agentId` to `name`, from the name the person saw. */
export const RenameAgent = AgentsDefinition.command("RenameAgent", {
  args: { ...Stores.AsMember, agentId: Identity.AgentId, name: Schema.String, expectedName: Schema.String },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ agentId, name, expectedName, ...member }) => {
      const done = Written.Rename({ agentId })
      return Stores.decoded(Agent.RenameInput, { agentId, name, expectedName }, refused(done)).pipe(
        Effect.flatMap((input) =>
          Stores.writer(stores, wrote(done), () => unkept(done))(member, (store) => store.write("AgentRenamed", input))
        ),
        Effect.catch(Effect.succeed)
      )
    }
  }
})

/** Remove `agentId`, which ends the membership `removeMemberId` of it in the workspace. */
export const RemoveAgent = AgentsDefinition.command("RemoveAgent", {
  args: { ...Stores.AsMember, agentId: Identity.AgentId, removeMemberId: MemberId.MemberId },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ agentId, removeMemberId, ...member }) => {
      const done = Written.Remove({ agentId })
      return Stores.writer(stores, wrote(done), () => unkept(done))(member, (store) =>
        store.write("MemberRemoved", { memberId: removeMemberId })
      )
    }
  }
})

/** List the models `connectionId` offers an agent. */
export const LoadModels = AgentsDefinition.command("LoadModels", {
  args: { workspaceId: WorkspaceId.WorkspaceId, connectionId: ConnectionContract.ConnectionId },
  messages: [Message.ReceivedModels, Message.FailedLoadModels],
  handler: function* () {
    return ({ workspaceId, connectionId }) =>
      Effect.gen(function* () {
        const client = yield* Api.asMember(workspaceId)
        const models = yield* client.connections.models({ params: { connectionId } })
        return Message.ReceivedModels({ connectionId, models })
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.succeed(Message.FailedLoadModels({ connectionId, error: refusalOf(Cause.squash(cause)) }))
        )
      )
  }
})

export const EffectsLayer = Layer.mergeAll(
  CreateAgent.layer,
  ConfigureAgent.layer,
  RenameAgent.layer,
  RemoveAgent.layer,
  LoadModels.layer
)
