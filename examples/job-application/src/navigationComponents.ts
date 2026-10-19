import { Menu, Tabs } from '@foldkit/ui'

import { Step } from './domain'

export const StepMenuBlock = Menu.create<Step.Step>()
export const StepTabsBlock = Tabs.create<Step.Step>()
