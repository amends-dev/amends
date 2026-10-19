import { Schema } from 'effect'

import { AsyncCounterDemoBlock } from './asyncCounterDemo'
import * as DemoTab from './demoTab'
import { NotePlayerDemoBlock } from './notePlayerDemo'
import { PlaygroundMenuBlock } from './playgroundMenu'

export const Model = Schema.Struct({
  demoTabs: DemoTab.DemoTabsBlock.Model,
  activeDemoTab: DemoTab.Tab,
  playgroundMenu: PlaygroundMenuBlock.Model,
  asyncCounterDemo: AsyncCounterDemoBlock.Model,
  notePlayerDemo: NotePlayerDemoBlock.Model,
})
export type Model = typeof Model.Type
