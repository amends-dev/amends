/** Agents in the workspace sidebar. */

import type { Identity } from "@amends-dev/core/identity"
import { iconButton } from "@amends-dev/design/control"
import { sidebarEmpty, sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import * as Option from "effect/Option"
import { activityOfAgent, readinessOfAgent } from "../../../data/agents.ts"
import { sidebarActivity, statusOfAgent } from "../../../view/agents.ts"
import { AgentsBlock } from "../block.ts"
import { listedAgents, mayAdd, Message, nameOfAgent } from "../definition.ts"

/**
 * Whether the list page, which the sidebar's title opens, is what the main content shows, and the agent whose page
 * it shows instead, if one.
 */
export type SidebarInputs = Readonly<{
  isListOpen: boolean
  openAgentId: Option.Option<Identity.AgentId>
  itemHref?: ((id: Identity.AgentId) => string | undefined) | undefined
  browseHref?: string | undefined
}>

/**
 * The sidebar's section of the agents: each by its name on a lilac mark with how it stands as a patch on it, Browse
 * to the list and, for a person who may add one, Add agent. The title opens the list and is current while it shows,
 * a row opens the page of its agent and is current while that shows. An empty section says so once the agents are
 * read.
 */
export const sidebarView = AgentsBlock.makeView.withInputs<SidebarInputs>(
  (model, { isListOpen, openAgentId, itemHref, browseHref }, h) => {
    const listed = listedAgents(model)

    return sidebarSections(h, [
      sidebarSection(h, {
        label: "Agents",
        onTitleClick: Message.ClickedBrowse(),
        titleHref: browseHref,
        isTitleCurrent: isListOpen,
        actions: [
          iconButton(
            h,
            { icon: "list", label: "Browse agents", onClick: Message.ClickedBrowse() },
            { size: "compact" }
          ),
          ...(mayAdd(model)
            ? [
                iconButton(
                  h,
                  { icon: "mark-new", label: "Add agent", onClick: Message.ClickedAdd() },
                  { size: "compact" }
                )
              ]
            : [])
        ],
        children:
          listed.length === 0 && model.isLoaded
            ? [sidebarEmpty(h, "No agents yet")]
            : listed.map((item) => {
                const activity = activityOfAgent(model, item)

                return sidebarItem(h, {
                  mark: { text: nameOfAgent(model, item.agent).slice(0, 1), tone: "lilac" },
                  status: statusOfAgent(readinessOfAgent(item), activity),
                  ...sidebarActivity(activity),
                  label: nameOfAgent(model, item.agent),
                  isPending: item.pending,
                  isCurrent: Option.contains(openAgentId, item.agent.id),
                  onClick: Message.ClickedAgent({ agentId: item.agent.id }),
                  href: itemHref?.(item.agent.id)
                })
              })
      })
    ])
  }
)
