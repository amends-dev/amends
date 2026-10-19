import { Tuple } from 'effect'
import type { Block } from 'foldkit'
import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { AsyncCounterDemoBlock } from './asyncCounterDemo'
import { HomeDefinition } from './definition'
import * as DemoTab from './demoTab'
import { Message, OutMessage } from './message'
import { Model } from './model'
import { NotePlayerDemoBlock } from './notePlayerDemo'
import { PlaygroundMenuBlock } from './playgroundMenu'

const foldDemoTabsOutMessage = DemoTab.DemoTabsBlock.OutMessage.match<
  Update.Step<Model, Message>,
  typeof DemoTab.DemoTabsBlock.OutMessage.Type
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, { activeDemoTab: () => value }),
    }),
})

export const DemoTabsBinding = HomeDefinition.bindChild(DemoTab.DemoTabsBlock, {
  field: 'demoTabs',
  outMessage: { fold: foldDemoTabsOutMessage },
  init: { contextToArgs: () => Tuple.make({ id: 'demo-tabs' }) },
})

const foldPlaygroundMenuOutMessage = PlaygroundMenuBlock.OutMessage.match<
  Update.StepWithOutMessage<Model, Message, OutMessage>,
  typeof PlaygroundMenuBlock.OutMessage.Type
>({
  Selected:
    ({ value }) =>
    model => ({
      model,
      outMessage: OutMessage.SelectedPlaygroundExample({ exampleSlug: value }),
    }),
  Closed: () => HomeDefinition.stepNoop(),
})

export const PlaygroundMenuBinding = HomeDefinition.bindChild(
  PlaygroundMenuBlock,
  {
    field: 'playgroundMenu',
    outMessage: { fold: foldPlaygroundMenuOutMessage },
    init: {
      contextToArgs: () =>
        Tuple.make({ id: 'playground-menu', isAnimated: true }),
    },
  },
)

export const AsyncCounterDemoBinding = HomeDefinition.bindChild(
  AsyncCounterDemoBlock,
  {
    field: 'asyncCounterDemo',
  },
)

export const NotePlayerDemoBinding = HomeDefinition.bindChild(
  NotePlayerDemoBlock,
  {
    field: 'notePlayerDemo',
  },
)

export const HomeComposition = HomeDefinition.makeComposition({
  bindings: [
    AsyncCounterDemoBinding,
    DemoTabsBinding,
    NotePlayerDemoBinding,
    PlaygroundMenuBinding,
  ],
})
export type HomeViewBuilder = Block.ViewBuilderFor<typeof HomeComposition>
