import * as Button from "@foldkit/ui/button"
import * as Option from "effect/Option"
import { errorView, sending } from "../../controls.ts"
import { GroupsComposition } from "./composition.ts"
import { Message, nameOf } from "./definition.ts"

/** The groups by name, the picked one marked, and a notice when reading them failed. */
export const view = GroupsComposition.makeView((model, h) =>
  h.nav(
    [h.AriaLabel("Groups")],
    [
      errorView(model.notice, h),
      h.ul(
        [],
        model.groups.map(({ group, pending }) =>
          h.keyed("li")(
            group.id,
            [],
            [
              Button.view(
                {
                  onClick: Message.ClickedGroup({ groupId: group.id }),
                  toView: (attributes) =>
                    h.button(
                      [
                        ...attributes.button,
                        ...(Option.contains(model.selected, group.id) ? [h.AriaCurrent("page")] : [])
                      ],
                      [nameOf(group, model.members, model.memberId)]
                    )
                },
                h
              ),
              sending(pending, h)
            ]
          )
        )
      )
    ]
  )
)
