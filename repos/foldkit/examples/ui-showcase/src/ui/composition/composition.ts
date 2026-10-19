import { Array, Option } from 'effect'
import { type Block, Calendar as FoldkitCalendar, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  CalendarBlock,
  DatePickerBlock,
  DialogBlock,
  FileDropBlock,
  HoverIntentBlock,
  PopoverBlock,
  SliderBlock,
  TooltipBlock,
} from '@foldkit/ui'

import { CityComboboxBlock, CityMultiComboboxBlock } from '../combobox'
import { UiDefinition } from '../definition'
import {
  CharacterListboxBlock,
  ItemListboxBlock,
  ItemMultiListboxBlock,
} from '../listbox'
import { DemoMenuBlock } from '../menu'
import { Message } from '../message'
import { Model } from '../model'
import { PlanRadioGroupBlock } from '../radioGroup'
import { DemoTabsBlock } from '../tabs'
import { ToastBlock } from '../toast'
import { ActivityVirtualListBlock } from '../virtualList'
import { AnimationDemoBinding } from './animation'
import { DragAndDropDemoBinding } from './dragAndDrop'

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

const foldToastOutMessage = ToastBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  DismissedToast: () => UiDefinition.stepNoop(),
})

const foldTooltipOutMessage = TooltipBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  Shown: () => UiDefinition.stepNoop(),
  Hidden: () => UiDefinition.stepNoop(),
})

const foldHoverIntentOutMessage = HoverIntentBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  Opened: () => UiDefinition.stepNoop(),
  Closed: () => UiDefinition.stepNoop(),
})

export const MobileMenuDialogBinding = UiDefinition.bindChild(DialogBlock, {
  field: 'mobileMenuDialog',
  init: { contextToArgs: () => [{ id: 'mobile-menu' }] },
  outMessage: { fold: foldDialogOutMessage },
})

const foldComboboxDemoOutMessage = CityComboboxBlock.OutMessage.match<
  Update.Step<Model, Message>
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
  init: { contextToArgs: () => [{ id: 'combobox-demo' }] },
  outMessage: { fold: foldComboboxDemoOutMessage },
})

const foldComboboxNullableDemoOutMessage = CityComboboxBlock.OutMessage.match<
  Update.Step<Model, Message>
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
    init: {
      contextToArgs: () => [{ id: 'combobox-nullable-demo', nullable: true }],
    },
    outMessage: { fold: foldComboboxNullableDemoOutMessage },
  },
)

const foldComboboxMultiDemoOutMessage = CityMultiComboboxBlock.OutMessage.match<
  Update.Step<Model, Message>
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
    init: { contextToArgs: () => [{ id: 'combobox-multi-demo' }] },
    outMessage: { fold: foldComboboxMultiDemoOutMessage },
  },
)

const foldComboboxPlacementLockDemoOutMessage =
  CityComboboxBlock.OutMessage.match<Update.Step<Model, Message>>({
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
    init: { contextToArgs: () => [{ id: 'combobox-placement-lock-demo' }] },
    outMessage: { fold: foldComboboxPlacementLockDemoOutMessage },
  },
)

const foldComboboxSelectOnFocusDemoOutMessage =
  CityComboboxBlock.OutMessage.match<Update.Step<Model, Message>>({
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
    init: {
      contextToArgs: () => [
        { id: 'combobox-select-on-focus-demo', selectInputOnFocus: true },
      ],
    },
    outMessage: { fold: foldComboboxSelectOnFocusDemoOutMessage },
  },
)

export const DialogDemoBinding = UiDefinition.bindChild(DialogBlock, {
  field: 'dialogDemo',
  init: { contextToArgs: () => [{ id: 'dialog-demo' }] },
  outMessage: { fold: foldDialogOutMessage },
})

export const DialogAnimatedDemoBinding = UiDefinition.bindChild(DialogBlock, {
  field: 'dialogAnimatedDemo',
  init: {
    contextToArgs: () => [{ id: 'dialog-animated-demo', isAnimated: true }],
  },
  outMessage: { fold: foldDialogOutMessage },
})

export const OverlayDialogDemoBinding = UiDefinition.bindChild(DialogBlock, {
  field: 'overlayDialogDemo',
  init: { contextToArgs: () => [{ id: 'overlay-dialog-demo' }] },
  outMessage: { fold: foldDialogOutMessage },
})

const foldOverlayComboboxDemoOutMessage = CityComboboxBlock.OutMessage.match<
  Update.Step<Model, Message>
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
    init: { contextToArgs: () => [{ id: 'overlay-combobox-demo' }] },
    outMessage: { fold: foldOverlayComboboxDemoOutMessage },
  },
)

export const NestedDialogParentDemoBinding = UiDefinition.bindChild(
  DialogBlock,
  {
    field: 'nestedDialogParentDemo',
    init: { contextToArgs: () => [{ id: 'nested-dialog-parent-demo' }] },
    outMessage: { fold: foldDialogOutMessage },
  },
)

export const NestedDialogChildDemoBinding = UiDefinition.bindChild(
  DialogBlock,
  {
    field: 'nestedDialogChildDemo',
    init: { contextToArgs: () => [{ id: 'nested-dialog-child-demo' }] },
    outMessage: { fold: foldDialogOutMessage },
  },
)

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
  init: {
    contextToArgs: today => [
      {
        id: 'calendar-basic-demo',
        today,
        minDate: FoldkitCalendar.subtractYears(today, 1),
        maxDate: FoldkitCalendar.addYears(today, 1),
      },
    ],
  },
  outMessage: { fold: foldCalendarBasicDemoOutMessage },
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
    init: {
      contextToArgs: today => [
        {
          id: 'date-picker-basic-demo',
          today,
          minDate: FoldkitCalendar.subtractYears(today, 1),
          maxDate: FoldkitCalendar.addYears(today, 1),
        },
      ],
    },
    outMessage: { fold: foldDatePickerBasicDemoOutMessage },
  },
)

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
  init: { contextToArgs: () => [{ id: 'file-drop-basic-demo' }] },
  outMessage: { fold: foldFileDropBasicDemoOutMessage },
})

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
  init: { contextToArgs: () => [{ id: 'listbox-demo' }] },
  outMessage: { fold: foldListboxDemoOutMessage },
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
    init: { contextToArgs: () => [{ id: 'listbox-multi-demo' }] },
    outMessage: { fold: foldListboxMultiDemoOutMessage },
  },
)

const foldListboxGroupedDemoOutMessage = CharacterListboxBlock.OutMessage.match<
  Update.Step<Model, Message>
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
    init: { contextToArgs: () => [{ id: 'listbox-grouped-demo' }] },
    outMessage: { fold: foldListboxGroupedDemoOutMessage },
  },
)

export const MenuBasicDemoBinding = UiDefinition.bindChild(DemoMenuBlock, {
  field: 'menuBasicDemo',
  init: { contextToArgs: () => [{ id: 'menu-basic-demo' }] },
  outMessage: { fold: foldMenuOutMessage },
})

export const MenuAnimatedDemoBinding = UiDefinition.bindChild(DemoMenuBlock, {
  field: 'menuAnimatedDemo',
  init: {
    contextToArgs: () => [{ id: 'menu-animated-demo', isAnimated: true }],
  },
  outMessage: { fold: foldMenuOutMessage },
})

export const PopoverBasicDemoBinding = UiDefinition.bindChild(PopoverBlock, {
  field: 'popoverBasicDemo',
  init: { contextToArgs: () => [{ id: 'popover-basic-demo' }] },
  outMessage: { fold: foldPopoverOutMessage },
})

export const PopoverAnimatedDemoBinding = UiDefinition.bindChild(PopoverBlock, {
  field: 'popoverAnimatedDemo',
  init: {
    contextToArgs: () => [{ id: 'popover-animated-demo', isAnimated: true }],
  },
  outMessage: { fold: foldPopoverOutMessage },
})

export const PopoverNestedParentDemoBinding = UiDefinition.bindChild(
  PopoverBlock,
  {
    field: 'popoverNestedParentDemo',
    init: {
      contextToArgs: () => [
        { id: 'popover-nested-parent-demo', contentFocus: true },
      ],
    },
    outMessage: { fold: foldPopoverOutMessage },
  },
)

export const PopoverNestedChildDemoBinding = UiDefinition.bindChild(
  PopoverBlock,
  {
    field: 'popoverNestedChildDemo',
    init: { contextToArgs: () => [{ id: 'popover-nested-child-demo' }] },
    outMessage: { fold: foldPopoverOutMessage },
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
    init: { contextToArgs: () => [{ id: 'vertical-radio-group-demo' }] },
    outMessage: { fold: foldVerticalRadioGroupDemoOutMessage },
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
    init: { contextToArgs: () => [{ id: 'horizontal-radio-group-demo' }] },
    outMessage: { fold: foldHorizontalRadioGroupDemoOutMessage },
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
  init: {
    contextToArgs: () => [
      { id: 'slider-rating-demo', min: 0, max: 10, step: 1 },
    ],
  },
  outMessage: { fold: foldSliderRatingDemoOutMessage },
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
  init: {
    contextToArgs: () => [
      { id: 'slider-volume-demo', min: 0, max: 1, step: 0.05 },
    ],
  },
  outMessage: { fold: foldSliderVolumeDemoOutMessage },
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
  init: { contextToArgs: () => [{ id: 'horizontal-tabs-demo' }] },
  outMessage: { fold: foldHorizontalTabsDemoOutMessage },
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
  init: { contextToArgs: () => [{ id: 'vertical-tabs-demo' }] },
  outMessage: { fold: foldVerticalTabsDemoOutMessage },
})

export const ToastDemoBinding = UiDefinition.bindChild(ToastBlock, {
  field: 'toastDemo',
  init: { contextToArgs: () => [{ id: 'toast-demo', swipeToDismiss: {} }] },
  outMessage: { fold: foldToastOutMessage },
})

export const TooltipBasicDemoBinding = UiDefinition.bindChild(TooltipBlock, {
  field: 'tooltipBasicDemo',
  init: { contextToArgs: () => [{ id: 'tooltip-basic-demo' }] },
  outMessage: { fold: foldTooltipOutMessage },
})

export const TooltipNoDelayDemoBinding = UiDefinition.bindChild(TooltipBlock, {
  field: 'tooltipNoDelayDemo',
  init: {
    contextToArgs: () => [{ id: 'tooltip-no-delay-demo', showDelay: 0 }],
  },
  outMessage: { fold: foldTooltipOutMessage },
})

export const HoverIntentDemoBinding = UiDefinition.bindChild(HoverIntentBlock, {
  field: 'hoverIntentDemo',
  outMessage: { fold: foldHoverIntentOutMessage },
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
      contextToArgs: () => [{ id: 'virtual-list-demo', rowHeightPx: 56 }],
    },
  },
)

export const VirtualListVariableDemoBinding = UiDefinition.bindChild(
  ActivityVirtualListBlock,
  {
    field: 'virtualListVariableDemo',
    outMessage: { fold: foldVirtualListOutMessage },
    init: {
      contextToArgs: () => [
        { id: 'virtual-list-variable-demo', rowHeightPx: 56 },
      ],
    },
  },
)

export const UiComposition = UiDefinition.makeComposition({
  bindings: [
    MobileMenuDialogBinding,
    ComboboxDemoBinding,
    ComboboxNullableDemoBinding,
    ComboboxMultiDemoBinding,
    ComboboxPlacementLockDemoBinding,
    ComboboxSelectOnFocusDemoBinding,
    DialogDemoBinding,
    DialogAnimatedDemoBinding,
    OverlayDialogDemoBinding,
    OverlayComboboxDemoBinding,
    NestedDialogParentDemoBinding,
    NestedDialogChildDemoBinding,
    CalendarBasicDemoBinding,
    DatePickerBasicDemoBinding,
    DragAndDropDemoBinding,
    FileDropBasicDemoBinding,
    ListboxDemoBinding,
    ListboxMultiDemoBinding,
    ListboxGroupedDemoBinding,
    MenuBasicDemoBinding,
    MenuAnimatedDemoBinding,
    PopoverBasicDemoBinding,
    PopoverAnimatedDemoBinding,
    PopoverNestedParentDemoBinding,
    PopoverNestedChildDemoBinding,
    VerticalRadioGroupDemoBinding,
    HorizontalRadioGroupDemoBinding,
    SliderRatingDemoBinding,
    SliderVolumeDemoBinding,
    HorizontalTabsDemoBinding,
    VerticalTabsDemoBinding,
    ToastDemoBinding,
    TooltipBasicDemoBinding,
    TooltipNoDelayDemoBinding,
    HoverIntentDemoBinding,
    AnimationDemoBinding,
    VirtualListDemoBinding,
    VirtualListVariableDemoBinding,
  ],
})
export type UiViewBuilder = Block.ViewBuilderFor<typeof UiComposition>
export type UiMessage = typeof UiComposition.Message.Type
