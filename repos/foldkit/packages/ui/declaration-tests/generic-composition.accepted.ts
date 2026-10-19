import { Duration, Layer, Option, Schema, SchemaTransformation } from 'effect'
import { Block, Message, Struct, makeApplicationDefinition } from 'foldkit'
import type * as Application from 'foldkit/application'
import { childAttributes } from 'foldkit/html'

import * as Combobox from '@foldkit/ui/combobox'
import * as Dialog from '@foldkit/ui/dialog'
import * as Listbox from '@foldkit/ui/listbox'
import * as Menu from '@foldkit/ui/menu'
import * as Popover from '@foldkit/ui/popover'
import * as Slider from '@foldkit/ui/slider'
import * as Toast from '@foldkit/ui/toast'
import * as Tooltip from '@foldkit/ui/tooltip'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false
type Expect<Value extends true> = Value

export const Item = Schema.Literals(['Apple', 'Pear'])
export const Picker = Combobox.create(Item)
export const EncodedItem = Schema.Number.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({
      decode: globalThis.String,
      encode: globalThis.Number,
    }),
  ),
)
export const EncodedPicker = Combobox.create(EncodedItem)
export const MultiPicker = Combobox.Multi.create(Item)
export const ListPicker = Listbox.create<'Apple' | 'Pear'>()
export const MultiListPicker = Listbox.Multi.create<'Apple' | 'Pear'>()
export const MenuPicker = Menu.create<'Apple' | 'Pear'>()
export const matchMenuOutMessage = MenuPicker.OutMessage.match<
  'Apple' | 'Pear' | 'Closed'
>({
  Selected: ({ value }) => value,
  Closed: () => 'Closed',
})
export const closedMenuOutMessage = MenuPicker.OutMessage.Closed()
export const menuTestDefinitions = [
  Menu.test.LockMenuScroll,
  Menu.test.UnlockMenuScroll,
  Menu.test.InertMenuOthers,
  Menu.test.RestoreMenuInert,
  Menu.test.FocusMenuItems,
  Menu.test.FocusMenuButton,
  Menu.test.ScrollMenuItemIntoView,
  Menu.test.ClickMenuItem,
  Menu.test.DelayClearMenuSearch,
  Menu.test.DetectMenuMovementOrAnimationEnd,
  Menu.test.AnchorMenu,
  Menu.test.PortalMenuBackdrop,
]
export const menuFactoryMounts: ReadonlyArray<
  typeof Menu.test.AnchorMenu | typeof Menu.test.PortalMenuBackdrop
> = MenuPicker.mounts
export const RootSlider = Slider.forRoot(() => document)
export const ToastPayload = Schema.Struct({
  kind: Schema.Literals(['Saved', 'Failed']),
})
export const ToastBlock = Toast.make(ToastPayload)
export const Model = Schema.Struct({
  dialog: Dialog.DialogBlock.Model,
  picker: Picker.Model,
  popover: Popover.PopoverBlock.Model,
  maybeSelected: Schema.Option(Item),
})
export const ParentMessage = Message.defineMessageUnion({
  ClickedClear: {},
})
export const ApplicationDefinition = makeApplicationDefinition({
  Model,
  Message: ParentMessage,
})

export const DialogBinding = ApplicationDefinition.bindChild(
  Dialog.DialogBlock,
  {
    field: 'dialog',
    init: { contextToArgs: () => [{ id: 'details' }] },
    outMessage: {
      fold: Dialog.DialogBlock.OutMessage.match({
        Opened: () => ApplicationDefinition.step(model => ({ model })),
        Closed: () => ApplicationDefinition.step(model => ({ model })),
        CompletedClose: () => ApplicationDefinition.step(model => ({ model })),
      }),
    },
  },
)

export const PickerBinding = ApplicationDefinition.bindChild(Picker, {
  field: 'picker',
  init: { contextToArgs: () => [{ id: 'fruit' }] },
  outMessage: {
    fold: Picker.OutMessage.match({
      Selected: ({ value }) =>
        ApplicationDefinition.step(model => ({
          model: Struct.modifyFields(model, {
            maybeSelected: () => Option.some(value),
          }),
        })),
      ClearedSelection: () =>
        ApplicationDefinition.step(model => ({
          model: Struct.modifyFields(model, {
            maybeSelected: () => Option.none(),
          }),
        })),
    }),
  },
})

export const PopoverBinding = ApplicationDefinition.bindChild(
  Popover.PopoverBlock,
  {
    field: 'popover',
    init: { contextToArgs: () => [{ id: 'help' }] },
    outMessage: {
      fold: Popover.PopoverBlock.OutMessage.match({
        Opened: () => ApplicationDefinition.step(model => ({ model })),
        Closed: () => ApplicationDefinition.step(model => ({ model })),
      }),
    },
  },
)

export type Composition = Application.Composition<
  typeof Model,
  typeof ParentMessage,
  readonly [],
  readonly [typeof DialogBinding, typeof PickerBinding, typeof PopoverBinding]
>

export const createComposition = (): Composition =>
  ApplicationDefinition.makeComposition({
    bindings: [DialogBinding, PickerBinding, PopoverBinding],
    mounts: [],
  })
export type Builder = Block.ViewBuilderFor<Composition>

export const pickerView = (model: typeof Model.Type, h: Builder) =>
  h.block(
    PickerBinding.embedView({
      slotId: 'fruit',
      model: model.picker,
      viewInputs: {
        items: ['Apple', 'Pear'],
        maybeSelectedValue: model.maybeSelected,
        restingInputValue: '',
        itemToValue: item => item,
        itemToDisplayText: item => item,
        itemToConfig: item => ({ content: h.span([], [item]) }),
        inputAttributes: childAttributes([
          h.OnClick(ParentMessage.ClickedClear()),
        ]),
        buttonContent: h.button(
          [h.OnClick(ParentMessage.ClickedClear())],
          ['Clear'],
        ),
      },
    }),
  )

export const helper = (model: typeof Model.Type, h: Builder) =>
  h.block(
    PopoverBinding.embedView({
      slotId: 'help',
      model: model.popover,
      viewInputs: {
        anchor: { placement: 'bottom-start', gap: 4 },
        toView: render =>
          h.div(
            [],
            [
              h.button(render.button, ['Help']),
              ...(render.isVisible
                ? [h.div(render.panel, [pickerView(model, h)])]
                : []),
            ],
          ),
      },
    }),
  )

export const author = (composition: Composition) => {
  const init = composition.makeInit(() => ({
    model: { maybeSelected: Option.none() },
  }))
  const update = composition.makeUpdate((model, _message) => ({ model }))
  const view = composition.makeView((model, h) => helper(model, h))

  return composition.assembleElement({ init, update, view, container: null })
}

export const application = author(createComposition())

export type GenericAssertions = [
  Expect<
    Equal<ReturnType<typeof matchMenuOutMessage>, 'Apple' | 'Pear' | 'Closed'>
  >,
  Expect<Equal<Parameters<typeof DialogBinding.requestOpen>, []>>,
  Expect<
    Equal<
      Parameters<typeof PickerBinding.requestSelectItem>,
      [item: 'Apple' | 'Pear', displayText: string]
    >
  >,
  Expect<
    Equal<
      Parameters<typeof Slider.SliderBlock.operations.informRangeChanged>,
      [
        model: typeof Slider.SliderBlock.Model.Type,
        payload: Block.OperationPayload<
          typeof Slider.SliderBlock.Message.InformedOfRangeChange
        >,
      ]
    >
  >,
  Expect<
    Equal<
      Parameters<typeof RootSlider.operations.informRangeChanged>,
      Parameters<typeof Slider.SliderBlock.operations.informRangeChanged>
    >
  >,
  Expect<
    Equal<
      Parameters<typeof Tooltip.TooltipBlock.operations.informShowDelayChanged>,
      [model: typeof Tooltip.TooltipBlock.Model.Type, showDelay: Duration.Input]
    >
  >,
  Expect<
    Equal<
      Parameters<typeof ToastBlock.operations.requestShow>,
      [
        model: typeof ToastBlock.Model.Type,
        input: Toast.ShowInput<typeof ToastPayload.Type>,
      ]
    >
  >,
]

export const sliderRangeChange =
  Slider.SliderBlock.operations.informRangeChanged(
    Slider.SliderBlock.init({ id: 'volume', min: 0, max: 100, step: 1 }).model,
    { min: 10, max: 90 },
  )
export const rootSliderRangeChange = RootSlider.operations.informRangeChanged(
  Slider.SliderBlock.init({ id: 'root-volume', min: 0, max: 100, step: 1 })
    .model,
  { min: 20, max: 80 },
)
export const tooltipDelayFromString =
  Tooltip.TooltipBlock.operations.informShowDelayChanged(
    Tooltip.TooltipBlock.init({ id: 'help' }).model,
    '250 millis',
  )
export const tooltipDelayFromNumber =
  Tooltip.TooltipBlock.operations.informShowDelayChanged(
    Tooltip.TooltipBlock.init({ id: 'details' }).model,
    300,
  )
export const tooltipDelayFromDuration =
  Tooltip.TooltipBlock.operations.informShowDelayChanged(
    Tooltip.TooltipBlock.init({ id: 'settings' }).model,
    Duration.millis(350),
  )
const toastModel = ToastBlock.init({ id: 'notifications' }).model
export const toastFromStringDuration = ToastBlock.operations.requestShow(
  toastModel,
  {
    payload: { kind: 'Saved' },
    duration: '1 second',
  },
)
export const toastFromNumberDuration = ToastBlock.operations.requestShow(
  toastModel,
  {
    payload: { kind: 'Failed' },
    duration: 1_000,
  },
)
export const toastFromDuration = ToastBlock.operations.requestShow(toastModel, {
  payload: { kind: 'Saved' },
  duration: Duration.seconds(2),
})

const ShapeModel = Schema.Struct({ value: Schema.String })
const ShapeMessage = Message.defineMessageUnion({ Changed: {} })
const ShapeOutMessage = Message.defineMessageUnion({ Changed: {} })
const DeclarationWithOutMessageDefinition = Block.makeDefinition(
  'DeclarationWithOutMessage',
  {
    Model: ShapeModel,
    Message: ShapeMessage,
    OutMessage: ShapeOutMessage,
  },
)
const DeclarationWithOutMessageComposition =
  DeclarationWithOutMessageDefinition.makeComposition()
const DeclarationWithoutOutMessageComposition = Block.makeDefinition(
  'DeclarationWithoutOutMessage',
  {
    Model: ShapeModel,
    Message: ShapeMessage,
  },
).makeComposition()
const withOutMessageInit = DeclarationWithOutMessageComposition.makeInit(
  () => ({ model: ShapeModel.make({ value: '' }) }),
)
const withoutOutMessageInit = DeclarationWithoutOutMessageComposition.makeInit(
  () => ({
    model: ShapeModel.make({ value: '' }),
  }),
)
const update = (model: typeof ShapeModel.Type) => ({ model })
const view = DeclarationWithOutMessageComposition.makeView.withInputs<
  Readonly<{ label: string }>
>((_model, { label }, h) => h.div([], [label]))
const plainView = DeclarationWithoutOutMessageComposition.makeView.withInputs<
  Readonly<{ label: string }>
>((_model, { label }, h) => h.div([], [label]))

const withViewAndOutMessageImplementation = {
  init: withOutMessageInit,
  update,
  view,
  EffectsLayer: Layer.empty,
}
export const WithViewAndOutMessage =
  DeclarationWithOutMessageComposition.assembleBlock(
    withViewAndOutMessageImplementation,
  )
export const WithOutMessageOnly =
  DeclarationWithOutMessageComposition.assembleBlock({
    init: withOutMessageInit,
    update,
    EffectsLayer: Layer.empty,
  })
export const WithViewOnly =
  DeclarationWithoutOutMessageComposition.assembleBlock({
    init: withoutOutMessageInit,
    update,
    view: plainView,
    EffectsLayer: Layer.empty,
  })
export const WithoutViewOrOutMessage =
  DeclarationWithoutOutMessageComposition.assembleBlock({
    init: withoutOutMessageInit,
    update,
    EffectsLayer: Layer.empty,
  })

type BroadOutMessageBlock = Block.Block<
  typeof DeclarationWithOutMessageDefinition.owner,
  typeof ShapeModel,
  typeof ShapeMessage,
  typeof ShapeOutMessage | undefined,
  (typeof DeclarationWithOutMessageComposition)[typeof Block.LocalMountsTypeId],
  typeof DeclarationWithOutMessageComposition.bindings,
  typeof withViewAndOutMessageImplementation
>
type OutMessagePresence<BlockValue> = BlockValue extends unknown
  ? BlockValue extends Readonly<{ OutMessage: unknown }>
    ? 'WithOutMessage'
    : 'WithoutOutMessage'
  : never

export type ShapeAssertions = [
  Expect<
    Equal<
      OutMessagePresence<BroadOutMessageBlock>,
      'WithOutMessage' | 'WithoutOutMessage'
    >
  >,
]
