import { Array, Option, Schema, Tuple, pipe } from 'effect'
import { Block, Calendar, Update } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import {
  AnimationBlock,
  CalendarBlock,
  DatePickerBlock,
  DialogBlock,
  DragAndDropBlock,
  FileDropBlock,
  HoverIntentBlock,
  PopoverBlock,
  SliderBlock,
  TooltipBlock,
} from '@foldkit/ui'
import { defaultLeaveCommand } from '@foldkit/ui/animation'
import { DragState } from '@foldkit/ui/dragAndDrop'

import { CityComboboxBlock, CityMultiComboboxBlock } from './combobox'
import { UiDefinition } from './definition'
import {
  ActivityVirtualListBlock,
  CharacterListboxBlock,
  DemoMenuBlock,
  DemoTabsBlock,
  ItemListboxBlock,
  ItemMultiListboxBlock,
  PlanRadioGroupBlock,
} from './demo/components'
import { ToastBlock } from './demo/toastModule'
import { type DemoCard, type DemoColumn } from './domain/domain'
import { Message } from './message'
import { Model } from './model'
import { VirtualListChatDemoBinding } from './virtualListChat'

export { VirtualListChatDemoBinding } from './virtualListChat'

// REORDER

const reorderColumns = (
  columns: ReadonlyArray<typeof DemoColumn.Type>,
  itemId: string,
  fromContainerId: string,
  toContainerId: string,
  toIndex: number,
): ReadonlyArray<typeof DemoColumn.Type> => {
  const maybeCard: Option.Option<typeof DemoCard.Type> = pipe(
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

        const inserted = pipe(withRemoved, cards => [
          ...Array.take(cards, toIndex),
          card,
          ...Array.drop(cards, toIndex),
        ])

        return modifyFields(column, { cards: () => inserted })
      }),
  })
}

const findDragAndDropDemoCardLabel = (
  columns: ReadonlyArray<typeof DemoColumn.Type>,
  itemId: string,
): string =>
  pipe(
    columns,
    Array.flatMap(column => column.cards),
    Array.findFirst(card => card.id === itemId),
    Option.match({
      onNone: () => itemId,
      onSome: card => card.label,
    }),
  )

const findDragAndDropDemoColumnLabel = (
  columns: ReadonlyArray<typeof DemoColumn.Type>,
  containerId: string,
): string =>
  pipe(
    columns,
    Array.findFirst(column => column.id === containerId),
    Option.match({
      onNone: () => containerId,
      onSome: column => column.label,
    }),
  )

const DragAndDropDemoAnnouncement = defineTaggedUnion({
  PickedUp: { label: Schema.String },
  MovedToColumn: { columnLabel: Schema.String, position: Schema.Number },
  MovedWithinColumn: { columnLabel: Schema.String, position: Schema.Number },
  Dropped: {
    label: Schema.String,
    columnLabel: Schema.String,
    position: Schema.Number,
  },
  Cancelled: {},
})
type DragAndDropDemoAnnouncement = typeof DragAndDropDemoAnnouncement.Type

const dragAndDropDemoAnnouncementToText = DragAndDropDemoAnnouncement.match({
  PickedUp: ({ label }) =>
    `Picked up ${label}. Use arrow keys to move within a column, Tab to move between columns, Space to drop, Escape to cancel.`,
  MovedToColumn: ({ columnLabel, position }) =>
    `Moved to ${columnLabel}, position ${position}.`,
  MovedWithinColumn: ({ columnLabel, position }) =>
    `Position ${position} in ${columnLabel}.`,
  Dropped: ({ label, columnLabel, position }) =>
    `Dropped ${label} in position ${position} of ${columnLabel}.`,
  Cancelled: () => 'Drag cancelled.',
})

const maybeDragAndDropDemoKeyboardAnnouncement = (
  model: Model,
  nextDragAndDrop: typeof DragAndDropBlock.Model.Type,
): Option.Option<DragAndDropDemoAnnouncement> =>
  DragState.matchOrElse<Option.Option<DragAndDropDemoAnnouncement>>(
    nextDragAndDrop.dragState,
    {
      KeyboardDragging: nextState =>
        DragState.matchOrElse<Option.Option<DragAndDropDemoAnnouncement>>(
          model.dragAndDropDemo.dragState,
          {
            Idle: () =>
              Option.some(
                DragAndDropDemoAnnouncement.PickedUp({
                  label: findDragAndDropDemoCardLabel(
                    model.dragAndDropDemoColumns,
                    nextState.itemId,
                  ),
                }),
              ),
            KeyboardDragging: previousState => {
              const columnLabel = findDragAndDropDemoColumnLabel(
                model.dragAndDropDemoColumns,
                nextState.targetContainerId,
              )
              const position = nextState.targetIndex + 1

              if (
                previousState.targetContainerId !== nextState.targetContainerId
              ) {
                return Option.some(
                  DragAndDropDemoAnnouncement.MovedToColumn({
                    columnLabel,
                    position,
                  }),
                )
              }

              if (previousState.targetIndex !== nextState.targetIndex) {
                return Option.some(
                  DragAndDropDemoAnnouncement.MovedWithinColumn({
                    columnLabel,
                    position,
                  }),
                )
              }

              return Option.none()
            },
          },
          () => Option.none(),
        ),
    },
    () => Option.none(),
  )

// CHILD FOLDS

const foldDialogOutMessage = DialogBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  Opened: () => UiDefinition.stepNoop(),
  Closed: () => UiDefinition.stepNoop(),
  CompletedClose: () => UiDefinition.stepNoop(),
})

const foldMenuOutMessage = DemoMenuBlock.OutMessage.match<
  Update.Step<Model, Message>,
  typeof DemoMenuBlock.OutMessage.Type
>({
  Selected: () => UiDefinition.stepNoop(),
  Closed: () => UiDefinition.stepNoop(),
})

const foldPopoverOutMessage = PopoverBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  Opened: () => UiDefinition.stepNoop(),
  Closed: () => UiDefinition.stepNoop(),
})

const foldCalendarBasicDemoOutMessage = CalendarBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  SelectedDate:
    ({ date }) =>
    model => ({
      model: modifyFields(model, {
        maybeCalendarBasicDemoSelectedDate: () => Option.some(date),
      }),
    }),
  ChangedViewMonth: () => UiDefinition.stepNoop(),
})

export const CalendarBasicDemoBinding = UiDefinition.bindChild(CalendarBlock, {
  field: 'calendarBasicDemo',
  outMessage: { fold: foldCalendarBasicDemoOutMessage },
  init: {
    contextToArgs: today =>
      Tuple.make({
        id: 'calendar-basic-demo',
        today,
        minDate: Calendar.subtractYears(today, 1),
        maxDate: Calendar.addYears(today, 1),
      }),
  },
})

const foldDatePickerBasicDemoOutMessage = DatePickerBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  SelectedDate:
    ({ date }) =>
    model => ({
      model: modifyFields(model, {
        maybeDatePickerBasicDemoSelectedDate: () => Option.some(date),
      }),
    }),
  ClearedDate: () => model => ({
    model: modifyFields(model, {
      maybeDatePickerBasicDemoSelectedDate: () => Option.none(),
    }),
  }),
  ChangedViewMonth: () => UiDefinition.stepNoop(),
})

export const DatePickerBasicDemoBinding = UiDefinition.bindChild(
  DatePickerBlock,
  {
    field: 'datePickerBasicDemo',
    outMessage: { fold: foldDatePickerBasicDemoOutMessage },
    init: {
      contextToArgs: today =>
        Tuple.make({
          id: 'date-picker-basic-demo',
          today,
          minDate: Calendar.subtractYears(today, 1),
          maxDate: Calendar.addYears(today, 1),
        }),
    },
  },
)

const foldComboboxDemoOutMessage = CityComboboxBlock.OutMessage.match<
  Update.Step<Model, Message>,
  typeof CityComboboxBlock.OutMessage.Type
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, {
        maybeComboboxDemoSelectedCity: () => Option.some(value),
      }),
    }),
  ClearedSelection: () => UiDefinition.stepNoop(),
})

export const ComboboxDemoBinding = UiDefinition.bindChild(CityComboboxBlock, {
  field: 'comboboxDemo',
  outMessage: { fold: foldComboboxDemoOutMessage },
  init: { contextToArgs: () => Tuple.make({ id: 'combobox-demo' }) },
})

const foldComboboxPlacementLockDemoOutMessage =
  CityComboboxBlock.OutMessage.match<
    Update.Step<Model, Message>,
    typeof CityComboboxBlock.OutMessage.Type
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          maybeComboboxPlacementLockDemoSelectedCity: () => Option.some(value),
        }),
      }),
    ClearedSelection: () => UiDefinition.stepNoop(),
  })

export const ComboboxPlacementLockDemoBinding = UiDefinition.bindChild(
  CityComboboxBlock,
  {
    field: 'comboboxPlacementLockDemo',
    outMessage: { fold: foldComboboxPlacementLockDemoOutMessage },
    init: {
      contextToArgs: () => Tuple.make({ id: 'combobox-placement-lock-demo' }),
    },
  },
)

const foldComboboxNullableDemoOutMessage = CityComboboxBlock.OutMessage.match<
  Update.Step<Model, Message>,
  typeof CityComboboxBlock.OutMessage.Type
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, {
        maybeComboboxNullableDemoSelectedCity:
          maybeComboboxNullableDemoSelectedCity =>
            Option.contains(maybeComboboxNullableDemoSelectedCity, value)
              ? Option.none()
              : Option.some(value),
      }),
    }),
  ClearedSelection: () => model => ({
    model: modifyFields(model, {
      maybeComboboxNullableDemoSelectedCity: () => Option.none(),
    }),
  }),
})

export const ComboboxNullableDemoBinding = UiDefinition.bindChild(
  CityComboboxBlock,
  {
    field: 'comboboxNullableDemo',
    outMessage: { fold: foldComboboxNullableDemoOutMessage },
    init: {
      contextToArgs: () =>
        Tuple.make({ id: 'combobox-nullable-demo', nullable: true }),
    },
  },
)

const foldComboboxMultiDemoOutMessage = CityMultiComboboxBlock.OutMessage.match<
  Update.Step<Model, Message>,
  typeof CityMultiComboboxBlock.OutMessage.Type
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, {
        comboboxMultiDemoSelectedCities: comboboxMultiDemoSelectedCities =>
          Array.contains(comboboxMultiDemoSelectedCities, value)
            ? Array.filter(
                comboboxMultiDemoSelectedCities,
                city => city !== value,
              )
            : Array.append(comboboxMultiDemoSelectedCities, value),
      }),
    }),
  ClearedSelection: () => UiDefinition.stepNoop(),
})

export const ComboboxMultiDemoBinding = UiDefinition.bindChild(
  CityMultiComboboxBlock,
  {
    field: 'comboboxMultiDemo',
    outMessage: { fold: foldComboboxMultiDemoOutMessage },
    init: { contextToArgs: () => Tuple.make({ id: 'combobox-multi-demo' }) },
  },
)

const foldComboboxSelectOnFocusDemoOutMessage =
  CityComboboxBlock.OutMessage.match<
    Update.Step<Model, Message>,
    typeof CityComboboxBlock.OutMessage.Type
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          maybeComboboxSelectOnFocusDemoSelectedCity: () => Option.some(value),
        }),
      }),
    ClearedSelection: () => UiDefinition.stepNoop(),
  })

export const ComboboxSelectOnFocusDemoBinding = UiDefinition.bindChild(
  CityComboboxBlock,
  {
    field: 'comboboxSelectOnFocusDemo',
    outMessage: { fold: foldComboboxSelectOnFocusDemoOutMessage },
    init: {
      contextToArgs: () =>
        Tuple.make({
          id: 'combobox-select-on-focus-demo',
          selectInputOnFocus: true,
        }),
    },
  },
)

export const DialogDemoBinding = UiDefinition.bindChild(DialogBlock, {
  field: 'dialogDemo',
  outMessage: { fold: foldDialogOutMessage },
  init: { contextToArgs: () => Tuple.make({ id: 'dialog-demo' }) },
})

export const DialogAnimatedDemoBinding = UiDefinition.bindChild(DialogBlock, {
  field: 'dialogAnimatedDemo',
  outMessage: { fold: foldDialogOutMessage },
  init: {
    contextToArgs: () =>
      Tuple.make({ id: 'dialog-animated-demo', isAnimated: true }),
  },
})

export const OverlayDialogDemoBinding = UiDefinition.bindChild(DialogBlock, {
  field: 'overlayDialogDemo',
  outMessage: { fold: foldDialogOutMessage },
  init: { contextToArgs: () => Tuple.make({ id: 'overlay-dialog-demo' }) },
})

const foldOverlayComboboxDemoOutMessage = CityComboboxBlock.OutMessage.match<
  Update.Step<Model, Message>,
  typeof CityComboboxBlock.OutMessage.Type
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, {
        maybeOverlayComboboxDemoSelectedCity: () => Option.some(value),
      }),
    }),
  ClearedSelection: () => UiDefinition.stepNoop(),
})

export const OverlayComboboxDemoBinding = UiDefinition.bindChild(
  CityComboboxBlock,
  {
    field: 'overlayComboboxDemo',
    outMessage: { fold: foldOverlayComboboxDemoOutMessage },
    init: { contextToArgs: () => Tuple.make({ id: 'overlay-combobox-demo' }) },
  },
)

export const NestedDialogParentDemoBinding = UiDefinition.bindChild(
  DialogBlock,
  {
    field: 'nestedDialogParentDemo',
    outMessage: { fold: foldDialogOutMessage },
    init: {
      contextToArgs: () => Tuple.make({ id: 'nested-dialog-parent-demo' }),
    },
  },
)

export const NestedDialogChildDemoBinding = UiDefinition.bindChild(
  DialogBlock,
  {
    field: 'nestedDialogChildDemo',
    outMessage: { fold: foldDialogOutMessage },
    init: {
      contextToArgs: () => Tuple.make({ id: 'nested-dialog-child-demo' }),
    },
  },
)

const foldListboxDemoOutMessage = ItemListboxBlock.OutMessage.match<
  Update.Step<Model, Message>,
  typeof ItemListboxBlock.OutMessage.Type
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, {
        maybeListboxDemoSelectedItem: () => Option.some(value),
      }),
    }),
})

export const ListboxDemoBinding = UiDefinition.bindChild(ItemListboxBlock, {
  field: 'listboxDemo',
  outMessage: { fold: foldListboxDemoOutMessage },
  init: { contextToArgs: () => Tuple.make({ id: 'listbox-demo' }) },
})

const foldListboxMultiDemoOutMessage = ItemMultiListboxBlock.OutMessage.match<
  Update.Step<Model, Message>,
  typeof ItemMultiListboxBlock.OutMessage.Type
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, {
        listboxMultiDemoSelectedItems: listboxMultiDemoSelectedItems =>
          Array.contains(listboxMultiDemoSelectedItems, value)
            ? Array.filter(
                listboxMultiDemoSelectedItems,
                item => item !== value,
              )
            : Array.append(listboxMultiDemoSelectedItems, value),
      }),
    }),
})

export const ListboxMultiDemoBinding = UiDefinition.bindChild(
  ItemMultiListboxBlock,
  {
    field: 'listboxMultiDemo',
    outMessage: { fold: foldListboxMultiDemoOutMessage },
    init: { contextToArgs: () => Tuple.make({ id: 'listbox-multi-demo' }) },
  },
)

const foldListboxGroupedDemoOutMessage = CharacterListboxBlock.OutMessage.match<
  Update.Step<Model, Message>,
  typeof CharacterListboxBlock.OutMessage.Type
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, {
        maybeListboxGroupedDemoSelectedItem: () => Option.some(value),
      }),
    }),
})

export const ListboxGroupedDemoBinding = UiDefinition.bindChild(
  CharacterListboxBlock,
  {
    field: 'listboxGroupedDemo',
    outMessage: { fold: foldListboxGroupedDemoOutMessage },
    init: { contextToArgs: () => Tuple.make({ id: 'listbox-grouped-demo' }) },
  },
)

export const MenuBasicDemoBinding = UiDefinition.bindChild(DemoMenuBlock, {
  field: 'menuBasicDemo',
  outMessage: { fold: foldMenuOutMessage },
  init: { contextToArgs: () => Tuple.make({ id: 'menu-basic-demo' }) },
})

export const MenuAnimatedDemoBinding = UiDefinition.bindChild(DemoMenuBlock, {
  field: 'menuAnimatedDemo',
  outMessage: { fold: foldMenuOutMessage },
  init: {
    contextToArgs: () =>
      Tuple.make({ id: 'menu-animated-demo', isAnimated: true }),
  },
})

export const PopoverBasicDemoBinding = UiDefinition.bindChild(PopoverBlock, {
  field: 'popoverBasicDemo',
  outMessage: { fold: foldPopoverOutMessage },
  init: { contextToArgs: () => Tuple.make({ id: 'popover-basic-demo' }) },
})

export const PopoverAnimatedDemoBinding = UiDefinition.bindChild(PopoverBlock, {
  field: 'popoverAnimatedDemo',
  outMessage: { fold: foldPopoverOutMessage },
  init: {
    contextToArgs: () =>
      Tuple.make({ id: 'popover-animated-demo', isAnimated: true }),
  },
})

export const PopoverArrowDemoBinding = UiDefinition.bindChild(PopoverBlock, {
  field: 'popoverArrowDemo',
  outMessage: { fold: foldPopoverOutMessage },
  init: { contextToArgs: () => Tuple.make({ id: 'popover-arrow-demo' }) },
})

export const PopoverNestedParentDemoBinding = UiDefinition.bindChild(
  PopoverBlock,
  {
    field: 'popoverNestedParentDemo',
    outMessage: { fold: foldPopoverOutMessage },
    init: {
      contextToArgs: () =>
        Tuple.make({ id: 'popover-nested-parent-demo', contentFocus: true }),
    },
  },
)

export const PopoverNestedChildDemoBinding = UiDefinition.bindChild(
  PopoverBlock,
  {
    field: 'popoverNestedChildDemo',
    outMessage: { fold: foldPopoverOutMessage },
    init: {
      contextToArgs: () => Tuple.make({ id: 'popover-nested-child-demo' }),
    },
  },
)

const foldSliderRatingDemoOutMessage = SliderBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  ChangedValue:
    ({ value }) =>
    model => ({
      model: modifyFields(model, { sliderRatingValue: () => value }),
    }),
})

export const SliderRatingDemoBinding = UiDefinition.bindChild(SliderBlock, {
  field: 'sliderRatingDemo',
  outMessage: { fold: foldSliderRatingDemoOutMessage },
  init: {
    contextToArgs: () =>
      Tuple.make({ id: 'slider-rating-demo', min: 0, max: 10, step: 1 }),
  },
})

const foldSliderVolumeDemoOutMessage = SliderBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  ChangedValue:
    ({ value }) =>
    model => ({
      model: modifyFields(model, { sliderVolumeValue: () => value }),
    }),
})

export const SliderVolumeDemoBinding = UiDefinition.bindChild(SliderBlock, {
  field: 'sliderVolumeDemo',
  outMessage: { fold: foldSliderVolumeDemoOutMessage },
  init: {
    contextToArgs: () =>
      Tuple.make({ id: 'slider-volume-demo', min: 0, max: 1, step: 0.05 }),
  },
})

const foldHorizontalTabsDemoOutMessage = DemoTabsBlock.OutMessage.match<
  Update.Step<Model, Message>,
  typeof DemoTabsBlock.OutMessage.Type
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, { horizontalTabsDemoTab: () => value }),
    }),
})

export const HorizontalTabsDemoBinding = UiDefinition.bindChild(DemoTabsBlock, {
  field: 'horizontalTabsDemo',
  outMessage: { fold: foldHorizontalTabsDemoOutMessage },
  init: { contextToArgs: () => Tuple.make({ id: 'horizontal-tabs-demo' }) },
})

const foldVerticalTabsDemoOutMessage = DemoTabsBlock.OutMessage.match<
  Update.Step<Model, Message>,
  typeof DemoTabsBlock.OutMessage.Type
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, { verticalTabsDemoTab: () => value }),
    }),
})

export const VerticalTabsDemoBinding = UiDefinition.bindChild(DemoTabsBlock, {
  field: 'verticalTabsDemo',
  outMessage: { fold: foldVerticalTabsDemoOutMessage },
  init: { contextToArgs: () => Tuple.make({ id: 'vertical-tabs-demo' }) },
})

const foldTooltipOutMessage = TooltipBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  Shown: () => UiDefinition.stepNoop(),
  Hidden: () => UiDefinition.stepNoop(),
})

export const TooltipDemoBinding = UiDefinition.bindChild(TooltipBlock, {
  field: 'tooltipDemo',
  outMessage: { fold: foldTooltipOutMessage },
  init: { contextToArgs: () => Tuple.make({ id: 'tooltip-demo' }) },
})

const foldHoverIntentOutMessage = HoverIntentBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  Opened: () => UiDefinition.stepNoop(),
  Closed: () => UiDefinition.stepNoop(),
})

export const HoverIntentCardDemoBinding = UiDefinition.bindChild(
  HoverIntentBlock,
  {
    field: 'hoverIntentCardDemo',
    outMessage: { fold: foldHoverIntentOutMessage },
  },
)

export const HoverIntentMenuDemoBinding = UiDefinition.bindChild(
  HoverIntentBlock,
  {
    field: 'hoverIntentMenuDemo',
    outMessage: { fold: foldHoverIntentOutMessage },
  },
)

const foldToastDemoOutMessage = ToastBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  DismissedToast:
    ({ payload }) =>
    model => ({
      model: modifyFields(model, {
        maybeLastDismissedToastTitle: () => Option.some(payload.title),
      }),
    }),
})

export const ToastDemoBinding = UiDefinition.bindChild(ToastBlock, {
  field: 'toastDemo',
  outMessage: { fold: foldToastDemoOutMessage },
  init: {
    contextToArgs: () => Tuple.make({ id: 'toast-demo', swipeToDismiss: {} }),
  },
})

const foldAnimationDemoOutMessage = (
  outMessage: typeof AnimationBlock.OutMessage.Type,
  {
    liftCommand,
  }: Update.FoldContext<typeof AnimationBlock.Message.Type, Message>,
) =>
  AnimationBlock.OutMessage.match(outMessage, {
    StartedLeaveAnimating: () =>
      UiDefinition.step(model => ({
        model,
        commands: [liftCommand(defaultLeaveCommand(model.animationDemo))],
      })),
    TransitionedOut: () => UiDefinition.stepNoop(),
  })

export const AnimationDemoBinding = UiDefinition.bindChild(AnimationBlock, {
  field: 'animationDemo',
  outMessage: { fold: foldAnimationDemoOutMessage },
  init: { contextToArgs: () => Tuple.make({ id: 'animation-demo' }) },
})

const foldFileDropBasicDemoOutMessage = FileDropBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  ReceivedFiles:
    ({ files }) =>
    model => ({
      model: modifyFields(model, {
        fileDropBasicDemoFiles: Array.appendAll(files),
      }),
    }),
  RejectedNonFiles: () => UiDefinition.stepNoop(),
})

export const FileDropBasicDemoBinding = UiDefinition.bindChild(FileDropBlock, {
  field: 'fileDropBasicDemo',
  outMessage: { fold: foldFileDropBasicDemoOutMessage },
  init: { contextToArgs: () => Tuple.make({ id: 'file-drop-basic-demo' }) },
})

const foldDragAndDropDemoOutMessage = DragAndDropBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  Reordered:
    ({ itemId, fromContainerId, toContainerId, toIndex }) =>
    model => {
      const label = findDragAndDropDemoCardLabel(
        model.dragAndDropDemoColumns,
        itemId,
      )
      const columnLabel = findDragAndDropDemoColumnLabel(
        model.dragAndDropDemoColumns,
        toContainerId,
      )

      return {
        model: modifyFields(model, {
          dragAndDropDemoColumns: dragAndDropDemoColumns =>
            reorderColumns(
              dragAndDropDemoColumns,
              itemId,
              fromContainerId,
              toContainerId,
              toIndex,
            ),
          dragAndDropDemoAnnouncement: () =>
            dragAndDropDemoAnnouncementToText(
              DragAndDropDemoAnnouncement.Dropped({
                label,
                columnLabel,
                position: toIndex + 1,
              }),
            ),
        }),
      }
    },
  Cancelled: () => model => ({
    model: modifyFields(model, {
      dragAndDropDemoAnnouncement: () =>
        dragAndDropDemoAnnouncementToText(
          DragAndDropDemoAnnouncement.Cancelled(),
        ),
    }),
  }),
})

export const DragAndDropDemoBinding = UiDefinition.bindChild(DragAndDropBlock, {
  read: model => Option.some(model.dragAndDropDemo),
  write: (model, nextDragAndDropDemo) =>
    modifyFields(model, {
      dragAndDropDemo: () => nextDragAndDropDemo,
      dragAndDropDemoAnnouncement: dragAndDropDemoAnnouncement =>
        Option.match(
          maybeDragAndDropDemoKeyboardAnnouncement(model, nextDragAndDropDemo),
          {
            onNone: () => dragAndDropDemoAnnouncement,
            onSome: dragAndDropDemoAnnouncementToText,
          },
        ),
    }),
  init: {
    contextToArgs: () => [{ id: 'drag-and-drop-demo' }],
    toParentFields: dragAndDropDemo => ({ dragAndDropDemo }),
  },
  outMessage: { fold: foldDragAndDropDemoOutMessage },
})

const foldVirtualListOutMessage = ActivityVirtualListBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  ObservedContainerScroll: () => UiDefinition.stepNoop(),
})

export const VirtualListDemoBinding = UiDefinition.bindChild(
  ActivityVirtualListBlock,
  {
    field: 'virtualListDemo',
    outMessage: { fold: foldVirtualListOutMessage },
    init: {
      contextToArgs: () =>
        Tuple.make({ id: 'virtual-list-demo', rowHeightPx: 56 }),
    },
  },
)

export const VirtualListVariableDemoBinding = UiDefinition.bindChild(
  ActivityVirtualListBlock,
  {
    field: 'virtualListVariableDemo',
    outMessage: { fold: foldVirtualListOutMessage },
    init: {
      contextToArgs: () =>
        Tuple.make({ id: 'virtual-list-variable-demo', rowHeightPx: 56 }),
    },
  },
)

const foldVerticalRadioGroupDemoOutMessage =
  PlanRadioGroupBlock.OutMessage.match<
    Update.Step<Model, Message>,
    typeof PlanRadioGroupBlock.OutMessage.Type
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          verticalRadioGroupDemoValue: () => Option.some(value),
        }),
      }),
  })

export const VerticalRadioGroupDemoBinding = UiDefinition.bindChild(
  PlanRadioGroupBlock,
  {
    field: 'verticalRadioGroupDemo',
    outMessage: { fold: foldVerticalRadioGroupDemoOutMessage },
    init: {
      contextToArgs: () => Tuple.make({ id: 'vertical-radio-group-demo' }),
    },
  },
)

const foldHorizontalRadioGroupDemoOutMessage =
  PlanRadioGroupBlock.OutMessage.match<
    Update.Step<Model, Message>,
    typeof PlanRadioGroupBlock.OutMessage.Type
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          horizontalRadioGroupDemoValue: () => Option.some(value),
        }),
      }),
  })

export const HorizontalRadioGroupDemoBinding = UiDefinition.bindChild(
  PlanRadioGroupBlock,
  {
    field: 'horizontalRadioGroupDemo',
    outMessage: { fold: foldHorizontalRadioGroupDemoOutMessage },
    init: {
      contextToArgs: () => Tuple.make({ id: 'horizontal-radio-group-demo' }),
    },
  },
)

export const UiComposition = UiDefinition.makeComposition({
  bindings: [
    AnimationDemoBinding,
    CalendarBasicDemoBinding,
    ComboboxDemoBinding,
    ComboboxMultiDemoBinding,
    ComboboxNullableDemoBinding,
    ComboboxPlacementLockDemoBinding,
    ComboboxSelectOnFocusDemoBinding,
    DatePickerBasicDemoBinding,
    DialogAnimatedDemoBinding,
    DialogDemoBinding,
    DragAndDropDemoBinding,
    FileDropBasicDemoBinding,
    HorizontalRadioGroupDemoBinding,
    HorizontalTabsDemoBinding,
    HoverIntentCardDemoBinding,
    HoverIntentMenuDemoBinding,
    ListboxDemoBinding,
    ListboxGroupedDemoBinding,
    ListboxMultiDemoBinding,
    MenuAnimatedDemoBinding,
    MenuBasicDemoBinding,
    NestedDialogChildDemoBinding,
    NestedDialogParentDemoBinding,
    OverlayComboboxDemoBinding,
    OverlayDialogDemoBinding,
    PopoverAnimatedDemoBinding,
    PopoverArrowDemoBinding,
    PopoverBasicDemoBinding,
    PopoverNestedChildDemoBinding,
    PopoverNestedParentDemoBinding,
    SliderRatingDemoBinding,
    SliderVolumeDemoBinding,
    ToastDemoBinding,
    TooltipDemoBinding,
    VerticalRadioGroupDemoBinding,
    VerticalTabsDemoBinding,
    VirtualListChatDemoBinding,
    VirtualListDemoBinding,
    VirtualListVariableDemoBinding,
  ],
})
export type UiViewBuilder = Block.ViewBuilderFor<typeof UiComposition>
