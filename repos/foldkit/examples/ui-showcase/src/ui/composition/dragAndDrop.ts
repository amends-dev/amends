import { Array, Option, pipe } from 'effect'
import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { DragAndDropBlock } from '@foldkit/ui'

import { UiDefinition } from '../definition'
import type { DemoColumn } from '../domain'
import { Message } from '../message'
import { Model } from '../model'

const reorderColumns = (
  columns: ReadonlyArray<DemoColumn>,
  itemId: string,
  fromContainerId: string,
  toContainerId: string,
  toIndex: number,
): ReadonlyArray<DemoColumn> => {
  const maybeCard = pipe(
    columns,
    Array.findFirst(({ id }) => id === fromContainerId),
    Option.flatMap(column =>
      Array.findFirst(column.cards, ({ id }) => id === itemId),
    ),
  )

  return Option.match(maybeCard, {
    onNone: () => columns,
    onSome: card =>
      Array.map(columns, column => {
        const withRemoved =
          column.id === fromContainerId
            ? Array.filter(column.cards, ({ id }) => id !== itemId)
            : column.cards

        if (column.id !== toContainerId) {
          return modifyFields(column, { cards: () => withRemoved })
        }

        const inserted = [
          ...Array.take(withRemoved, toIndex),
          card,
          ...Array.drop(withRemoved, toIndex),
        ]

        return modifyFields(column, { cards: () => inserted })
      }),
  })
}

const foldDragAndDropDemoOutMessage = DragAndDropBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  Reordered:
    ({ itemId, fromContainerId, toContainerId, toIndex }) =>
    model => ({
      model: modifyFields(model, {
        dragAndDropDemoColumns: dragAndDropDemoColumns =>
          reorderColumns(
            dragAndDropDemoColumns,
            itemId,
            fromContainerId,
            toContainerId,
            toIndex,
          ),
      }),
    }),
  Cancelled: () => UiDefinition.stepNoop(),
})

export const DragAndDropDemoBinding = UiDefinition.bindChild(DragAndDropBlock, {
  field: 'dragAndDropDemo',
  init: { contextToArgs: () => [{ id: 'drag-and-drop-demo' }] },
  outMessage: { fold: foldDragAndDropDemoOutMessage },
})
