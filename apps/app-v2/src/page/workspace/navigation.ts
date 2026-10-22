/** Read the durable destination from the page that owns each selection. */

import { Destination } from "../../route.ts"
import { type Model, Open } from "./definition.ts"
import { destinationOf as homeDestinationOf } from "./home/navigation.ts"

export const destinationOf = (model: Model): Destination =>
  Open.match(model.open, {
    Home: () => Destination.Home({ destination: homeDestinationOf(model.home) }),
    Connections: () => Destination.Connections({ tab: model.connections.browse.tab }),
    Connection: ({ connectionId }) => Destination.Connection({ connectionId }),
    Agents: () => Destination.Agents({ tab: model.agents.browse.tab }),
    Agent: ({ agentId }) => Destination.Agent({ agentId }),
    Settings: ({ page, memberId }) => Destination.Settings({ page, memberId }),
    Channels: () => Destination.Channels()
  })
