import { Tuple } from 'effect'
import type { Block } from 'foldkit'
import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { Message, Model, PlaygroundDefinition } from './definition'
import { PlaygroundFileTabsBlock } from './fileTabs'
import { MountPlaygroundEditor } from './mount'

const foldPlaygroundFileTabsOutMessage =
  PlaygroundFileTabsBlock.OutMessage.match<Update.Step<Model, Message>>({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { activeFilePath: () => value }),
      }),
  })

export const FileTabsBinding = PlaygroundDefinition.bindChild(
  PlaygroundFileTabsBlock,
  {
    field: 'fileTabs',
    outMessage: { fold: foldPlaygroundFileTabsOutMessage },
    init: { contextToArgs: () => Tuple.make({ id: 'playground-files' }) },
  },
)

export const PlaygroundComposition = PlaygroundDefinition.makeComposition({
  mounts: [MountPlaygroundEditor],
  bindings: [FileTabsBinding],
})
export type PlaygroundViewBuilder = Block.ViewBuilderFor<
  typeof PlaygroundComposition
>
