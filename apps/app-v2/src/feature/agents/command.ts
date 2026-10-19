/**
 * What the person does with the workspace's agents: adding one, renaming one, and changing how
 * one is set up are actions written to their store; listing the models a connection offers goes
 * over HTTP, since no replica holds them.
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import { Agent } from "@amends-dev/core/agent"
import { Role } from "@amends-dev/core/authorization"
import { CoreError } from "@amends-dev/core/error"
import { Identity } from "@amends-dev/core/identity"
import { WorkspaceId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Api from "../../api.ts"
import * as Stores from "../../store/Stores.ts"
import { AgentsDefinition, Message } from "./definition.ts"

const written = [Message.WroteAction, Message.FailedWriteAction]

/** Why `error` kept the action from being written, as the person reads it. */
const failed = (error: string) => Message.FailedWriteAction({ error })

const unreachable = "The host could not be reached. Try again."

/** Why the host refused a request, as core words it, or that it could not be reached. */
const refusalOf = (error: unknown) => (Schema.is(CoreError.Rejection)(error) ? error.message : unreachable)

/** Add an agent called `name`, starting with the role `roleId`, set up as `configuration` says. */
export const CreateAgent = AgentsDefinition.command("CreateAgent", {
  args: { ...Stores.AsMember, name: Schema.String, roleId: Role.RoleId, configuration: Agent.Configuration },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ name, roleId, configuration, ...member }) =>
      Stores.decoded(Agent.CreateInput, { name, roleId, ...configuration }, failed("An agent needs a name.")).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("AgentCreated", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Set `agentId` up as `configuration` says, in place of how it is set up. */
export const ConfigureAgent = AgentsDefinition.command("ConfigureAgent", {
  args: { ...Stores.AsMember, agentId: Identity.AgentId, configuration: Agent.Configuration },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ agentId, configuration, ...member }) =>
      write(member, (store) => store.write("AgentConfigured", { agentId, ...configuration }))
  }
})

/** Rename `agentId` to `name`, from the name the person saw. */
export const RenameAgent = AgentsDefinition.command("RenameAgent", {
  args: { ...Stores.AsMember, agentId: Identity.AgentId, name: Schema.String, expectedName: Schema.String },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ agentId, name, expectedName, ...member }) =>
      Stores.decoded(Agent.RenameInput, { agentId, name, expectedName }, failed("An agent needs a name.")).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("AgentRenamed", input))),
        Effect.catch(Effect.succeed)
      )
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
        Effect.catch((error) => Effect.succeed(Message.FailedLoadModels({ connectionId, error: refusalOf(error) })))
      )
  }
})

export const EffectsLayer = Layer.mergeAll(CreateAgent.layer, ConfigureAgent.layer, RenameAgent.layer, LoadModels.layer)
