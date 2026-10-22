/** Connection capability sections in the workspace sidebar. */

import type { Connection as ConnectionContract } from "@amends-dev/connection"
import { iconButton } from "@amends-dev/design/control"
import { sidebarEmpty, sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import * as Option from "effect/Option"
import { areIntegrationsListed, connectionItemsGiving } from "../../../data/connections.ts"
import { ConnectionsBlock } from "../block.ts"
import { mayAdd, Message, type Model } from "../definition.ts"
import { addLabel, capabilityLabels, connectionStatus } from "./wording.ts"

/** The sections of the sidebar that list connections, one for each thing a connection can give the workspace. */
const capabilitySections = ["models", "tools", "sandboxes", "harnesses"] as const

/**
 * Whether the list is what the main content shows, which marks the title of the tab it is on current; the connection
 * whose page it shows instead, if one; and whether the channels are, which marks the Channels title current.
 */
export type SidebarInputs = Readonly<{
  isListOpen: boolean
  openConnectionId: Option.Option<ConnectionContract.ConnectionId>
  isChannelsOpen: boolean
}>

/**
 * Whether the sidebar may say a section has no connections: they and the integrations that say what they give are read.
 */
const isReadForSections = (model: Model): boolean => model.isLoaded && areIntegrationsListed(model)

/**
 * The sidebar of the connections: a section for each thing a connection gives, Models, Tools, Sandboxes, and
 * Harnesses, listing the connections whose integration gives it, so one that gives two is in both, each with its
 * status at the end of its row, and then Channels, with a way to browse them. A title and a Browse button open the
 * list on that tab, and a row opens the page of its connection. An empty section says so once the connections and
 * the integrations are read.
 */
export const sidebarView = ConnectionsBlock.makeView.withInputs<SidebarInputs>(
  (model, { isListOpen, openConnectionId, isChannelsOpen }, h) =>
    sidebarSections(h, [
      ...capabilitySections.map((capability) => {
        const listed = connectionItemsGiving(model, capability)
        const title = capabilityLabels[capability]
        const openList = Message.ClickedBrowse({ tab: capability })

        return sidebarSection(h, {
          label: title,
          onTitleClick: openList,
          isTitleCurrent: isListOpen && model.browse.tab === capability,
          actions: [
            iconButton(
              h,
              { icon: "list", label: `Browse ${title.toLowerCase()}`, onClick: openList },
              { size: "compact" }
            ),
            ...(mayAdd(model)
              ? [
                  iconButton(
                    h,
                    {
                      icon: "mark-new",
                      label: addLabel(Option.some(capability)),
                      onClick: Message.ClickedAdd({ capability: Option.some(capability) })
                    },
                    { size: "compact" }
                  )
                ]
              : [])
          ],
          children:
            listed.length === 0 && isReadForSections(model)
              ? [sidebarEmpty(h, "None yet")]
              : listed.map((item) =>
                  sidebarItem(h, {
                    icon: "mark-connections",
                    status: connectionStatus(item),
                    label: item.connection.name,
                    isPending: item.pending,
                    isCurrent: Option.contains(openConnectionId, item.connection.id),
                    onClick: Message.ClickedConnection({ connectionId: item.connection.id })
                  })
                )
        })
      }),
      sidebarSection(h, {
        label: "Channels",
        onTitleClick: Message.ClickedBrowseChannels(),
        isTitleCurrent: isChannelsOpen,
        actions: [
          iconButton(
            h,
            { icon: "list", label: "Browse channels", onClick: Message.ClickedBrowseChannels() },
            { size: "compact" }
          )
        ],
        children: []
      })
    ])
)
