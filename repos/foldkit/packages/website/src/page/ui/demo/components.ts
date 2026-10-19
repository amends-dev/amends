import { Listbox, Menu, RadioGroup, Tabs, VirtualList } from '@foldkit/ui'

import type {
  DemoTab,
  ListboxItem,
  Plan,
  VirtualListChatMessage,
} from '../domain/domain'

export type Character = Readonly<{
  firstName: string
  lastName: string
}>

export const ItemListboxBlock = Listbox.create<ListboxItem>()
export const ItemMultiListboxBlock = Listbox.Multi.create<ListboxItem>()
export const CharacterListboxBlock = Listbox.create<Character>()

export type MenuItem = 'Edit' | 'Duplicate' | 'Archive' | 'Move' | 'Delete'

export const DemoMenuBlock = Menu.create<MenuItem>()

export const PlanRadioGroupBlock = RadioGroup.create<Plan>()

export const DemoTabsBlock = Tabs.create<DemoTab>()

import type { Activity } from './virtualListData'

export const ActivityVirtualListBlock = VirtualList.create<Activity>()
export const ChatVirtualListBlock = VirtualList.create<VirtualListChatMessage>()
