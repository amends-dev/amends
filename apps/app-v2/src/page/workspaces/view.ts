import { copy, heading, screenContent } from "@amends-dev/design/centered"
import { notice } from "@amends-dev/design/control"
import { row, section } from "@amends-dev/design/directory"
import * as Option from "effect/Option"
import { WorkspacesComposition } from "./composition.ts"
import { Message, Workspaces } from "./definition.ts"

const pluralize = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`

const firstLetterOf = (name: string): string => Array.from(name).at(0) ?? ""

export const view = WorkspacesComposition.makeView((model, h) =>
  Workspaces.match(model.workspaces, {
    Loading: () => screenContent(h, [heading(h, "Choose a workspace"), copy(h, "Loading your workspaces…")]),
    Failed: ({ error }) => screenContent(h, [heading(h, "Choose a workspace"), notice(h, Option.some(error))]),
    Loaded: ({ memberships }) =>
      memberships.length === 0
        ? screenContent(h, [heading(h, "Choose a workspace"), copy(h, "You belong to no workspace yet.")])
        : screenContent(h, [
            heading(h, "Choose a workspace"),
            copy(h, pluralize(memberships.length, "workspace", "workspaces")),
            section(h, { label: "Your workspaces", count: memberships.length }),
            h.ul(
              [h.AriaLabel("Workspaces")],
              memberships.map(({ workspace, member, activeMemberCount }) =>
                h.keyed("li")(
                  workspace.id,
                  [],
                  [
                    row(h, {
                      mark: firstLetterOf(workspace.name),
                      title: workspace.name,
                      meta: `${pluralize(activeMemberCount, "member", "members")} · as ${member.name}`,
                      action: "Open →",
                      onClick: Message.ClickedWorkspace({ workspaceId: workspace.id })
                    })
                  ]
                )
              )
            )
          ])
  })
)
