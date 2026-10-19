import { Option, Tuple } from 'effect'
import type { Block } from 'foldkit'
import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { ExampleDetailDefinition } from './definition'
import { SourceFileTabsBlock } from './fileTabs'
import { Message } from './message'
import { Model } from './model'
import { ObserveExampleUrlMessages } from './mount'

export const SOURCE_FILE_TABS_ID = 'source-file-tabs'

const foldSourceFileTabsOutMessage = SourceFileTabsBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, {
        maybeActiveSourceFilePath: () => Option.some(value),
      }),
    }),
})

export const SourceFileTabsBinding = ExampleDetailDefinition.bindChild(
  SourceFileTabsBlock,
  {
    field: 'sourceFileTabs',
    outMessage: { fold: foldSourceFileTabsOutMessage },
    init: { contextToArgs: () => Tuple.make({ id: SOURCE_FILE_TABS_ID }) },
  },
)

export const mounts = [ObserveExampleUrlMessages]

export const ExampleDetailComposition = ExampleDetailDefinition.makeComposition(
  {
    bindings: [SourceFileTabsBinding],
    mounts,
  },
)
export type ExampleDetailViewBuilder = Block.ViewBuilderFor<
  typeof ExampleDetailComposition
>
