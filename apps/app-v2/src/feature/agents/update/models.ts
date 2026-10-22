/** Loading and caching the models offered by an agent’s connection. */

import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { LoadModels } from "../command.ts"
import { type Model, offeredBy, OfferedModels } from "../definition.ts"

/** The model with `offered` among the models the connections offer, in place of those it had for its connection. */
export const withOffered = (model: Model, offered: OfferedModels): Model =>
  modifyFields(model, {
    offered: (all) => [...all.filter(({ connectionId }) => connectionId !== offered.connectionId), offered]
  })

/** Ask for the models `connectionId` offers, if it is one of the workspace's connections. */
export const askForModels = (model: Model, connectionId: string) =>
  Option.match(Option.fromUndefinedOr(model.connections.find(({ connection }) => connection.id === connectionId)), {
    onNone: () => ({ model }),
    onSome: ({ connection }) => ({
      model: withOffered(model, OfferedModels.Loading({ connectionId: connection.id })),
      commands: [LoadModels({ workspaceId: model.workspaceId, connectionId: connection.id })]
    })
  })

/** Ask for the models `connectionId` offers, unless they are loaded or on their way. */
export const askForModelsOnce = (model: Model, connectionId: string) =>
  Option.exists(offeredBy(model, connectionId), OfferedModels.isAnyOf(["Loading", "Loaded"]))
    ? { model }
    : askForModels(model, connectionId)
