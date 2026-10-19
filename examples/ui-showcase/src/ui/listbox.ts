import { Listbox } from '@foldkit/ui'

import type { ListboxItem } from './domain'

export type Character = Readonly<{
  firstName: string
  lastName: string
}>

export const ItemListboxBlock = Listbox.create<ListboxItem>()
export const ItemMultiListboxBlock = Listbox.Multi.create<ListboxItem>()
export const CharacterListboxBlock = Listbox.create<Character>()
