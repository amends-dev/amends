import { notice } from "@amends-dev/design/control"
import { pane, paneColumn } from "@amends-dev/design/pane"
import { view as composerView } from "../composer/view.ts"
import { welcome } from "../threads/view/list.ts"
import { UnsentConversationBlock } from "./block.ts"
import { ComposerBinding } from "./composition.ts"
import { nameOf } from "./definition.ts"

/** The workspace's name, which a phone shows under the conversation's title. */
export type ViewInputs = Readonly<{ workspaceName: string }>

/**
 * The conversation as it will be, in the main pane: titled by the people it is with, marked by a message as a
 * conversation is, with the welcome a conversation with nothing said in it has, and the composer of its first message
 * in the footer, named "Message Bob" or "Message Bob, Carol" while it is empty.
 */
export const view = UnsentConversationBlock.makeView.withInputs<ViewInputs>((model, { workspaceName }, h) => {
  const name = nameOf(model)

  return pane(h, {
    variant: "main",
    label: name,
    header: { title: name, icon: "message", phoneContext: workspaceName },
    anchor: "top",
    body: [
      paneColumn(h, [notice(h, model.notice), welcome({ groupName: name, isTeam: false, memberNames: [] }, h)], {
        isWide: true
      })
    ],
    footer: [
      h.block(
        ComposerBinding.embedView({
          slotId: "composer",
          model: model.composer,
          view: composerView,
          viewInputs: { placeholder: `Message ${name}`, members: model.members }
        })
      )
    ]
  })
})
