import { Context, Effect, Layer, Option, Schema } from 'effect'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest'

import { makeNamespace } from '../block/define.js'
import type * as Command from '../command/index.js'
import { defineMessageUnion } from '../message/index.js'
import { modifyFields } from '../struct/index.js'
import type * as Update from '../update/index.js'
import type { Url } from '../url/index.js'
import type {
  Application as ApplicationProgram,
  Element as ElementProgram,
  ViewBuilderFor,
} from './applicationPublic.js'
import { makeDefinition as makeApplicationDefinition } from './applicationPublic.js'
import * as ModelPreservationBridge from './modelPreservationBridge.js'
import { embed } from './start.js'

class ValueSource extends Context.Service<
  ValueSource,
  Readonly<{ value: string }>
>()('ApplicationAuthoring/ValueSource') {}

const ChildOwnerNamespace = makeNamespace('ApplicationAuthoringChild')
const ChildModel = Schema.Struct({ value: Schema.String })
const ChildMessage = defineMessageUnion({
  UpdatedChildValue: { value: Schema.String },
})

const ChildComposition = ChildOwnerNamespace.makeDefinition({
  Model: ChildModel,
  Message: ChildMessage,
}).makeComposition()
const childBlock = ChildComposition.assembleBlock({
  init: () => ({ model: { value: 'child' } }),
  update: ChildComposition.makeUpdate((model, { value }) => ({
    model: modifyFields(model, { value: () => value }),
  })),
  view: ChildComposition.makeView((model, h) => h.span([], [model.value])),
})

const Model = Schema.Struct({
  rootValue: Schema.String,
  child: ChildModel,
})
const Message = defineMessageUnion({
  ClickedReadRootValue: {},
  CompletedReadRootValue: { value: Schema.String },
})
const ForeignMessage = defineMessageUnion({ ForeignCompleted: {} })
const ApplicationDefinition = makeApplicationDefinition({ Model, Message })
const ChildBinding = ApplicationDefinition.bindChild(childBlock, {
  read: model => Option.some(model.child),
  write: (model, nextChild) => modifyFields(model, { child: () => nextChild }),
})
const graphlessComposition = ApplicationDefinition.makeComposition({
  bindings: [ChildBinding],
})
const ReadRootValue = ApplicationDefinition.command('ReadRootValue', {
  messages: [Message.CompletedReadRootValue],
  handler: function* () {
    const source = yield* ValueSource

    return () =>
      Effect.succeed(Message.CompletedReadRootValue({ value: source.value }))
  },
})
const documentView = graphlessComposition.makeView((model, h) => ({
  title: model.rootValue,
  body: h.div([], [model.rootValue]),
}))
const graphlessElementView = graphlessComposition.makeView((model, h) =>
  h.div([], [model.rootValue]),
)
const ObserveRoot = ApplicationDefinition.mount('ObserveRoot', {
  messages: [Message.CompletedReadRootValue],
  handler: function* () {
    return () =>
      Effect.succeed(Message.CompletedReadRootValue({ value: 'mounted' }))
  },
})
const mountedComposition = ApplicationDefinition.makeComposition({
  mounts: [ObserveRoot],
  bindings: [ChildBinding],
})
const mountedView = mountedComposition.makeView((model, h) =>
  h.div([h.OnMount(ObserveRoot())], [model.rootValue]),
)
const composition = ApplicationDefinition.makeComposition({
  bindings: [ChildBinding],
})
const initSource = () =>
  ChildBinding.init({
    args: [],
    toParentModel: child => ({ rootValue: 'pending', child }),
  })
const init = composition.makeInit(initSource)
const update = composition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedReadRootValue: () => ({
      model,
      commands: [ReadRootValue()],
    }),
    CompletedReadRootValue: ({ value }) => ({
      model: modifyFields(model, { rootValue: () => value }),
    }),
  }),
)
expectTypeOf<Update.RequirementsOf<typeof update>>().toEqualTypeOf<
  Command.HandlerOf<typeof ReadRootValue>
>()
const rootBody = (
  model: typeof Model.Type,
  h: ViewBuilderFor<typeof composition>,
) =>
  h.div(
    [],
    [
      h.button([h.OnClick(Message.ClickedReadRootValue())], [model.rootValue]),
      h.block(
        ChildBinding.embedView({
          slotId: 'child',
          model: model.child,
        }),
      ),
    ],
  )
const view = composition.makeView(rootBody)

const NoMessageModel = Schema.Null

const NoMessageComposition = makeApplicationDefinition({
  Model: NoMessageModel,
  Message: Schema.Never,
}).makeComposition()
const noMessageInit = () => ({ model: null })
const noMessageUpdate = NoMessageComposition.makeUpdate()
const noMessageDocumentView = NoMessageComposition.makeView((_model, h) => ({
  title: 'No messages',
  body: h.empty,
}))
const noMessageElementView = NoMessageComposition.makeView(
  (_model, h) => h.empty,
)

const typecheckRootCompletion = (): void => {
  // @ts-expect-error An Application Definition does not author the primary view.
  ApplicationDefinition.makeView
  // @ts-expect-error An Application Definition does not expose the Composition-owned init helper.
  ApplicationDefinition.makeInit

  ApplicationDefinition.command('AcceptedCommand', {
    messages: [Message.CompletedReadRootValue],
  })
  ApplicationDefinition.mount('AcceptedMount', {
    messages: [Message.CompletedReadRootValue],
  })
  ApplicationDefinition.mountStream('AcceptedMountStream', {
    messages: [Message.CompletedReadRootValue],
  })

  ApplicationDefinition.command('ForeignCommand', {
    // @ts-expect-error Root Commands must produce the Application Message.
    messages: [ForeignMessage.ForeignCompleted],
  })
  ApplicationDefinition.mount('ForeignMount', {
    // @ts-expect-error Root Mounts must produce the Application Message.
    messages: [ForeignMessage.ForeignCompleted],
  })
  ApplicationDefinition.mountStream('ForeignMountStream', {
    // @ts-expect-error Root stream Mounts must produce the Application Message.
    messages: [ForeignMessage.ForeignCompleted],
  })
  // @ts-expect-error Primitive authoring remains on the Application Definition.
  composition.command

  composition.makeUpdate((model, message) =>
    Message.match(message, {
      ClickedReadRootValue: () => ({ model }),
      CompletedReadRootValue: () => ({ model }),
    }),
  )

  composition.assembleElement({
    container: null,
    init,
    update,
    view: graphlessElementView,
    EffectsLayer: ReadRootValue.layer,
  })

  const application = composition.assembleApplication({
    container: null,
    init,
    update,
    view: documentView,
    EffectsLayer: ReadRootValue.layer,
  })
  const pendingApplication: ApplicationProgram<
    undefined,
    void,
    ValueSource,
    never,
    Layer.Success<typeof ReadRootValue.layer>
  > = application
  void pendingApplication

  NoMessageComposition.assembleApplication({
    container: null,
    init: noMessageInit,
    update: noMessageUpdate,
    view: noMessageDocumentView,
  })
  NoMessageComposition.assembleElement({
    container: null,
    init: noMessageInit,
    update: noMessageUpdate,
    view: noMessageElementView,
  })

  // @ts-expect-error assembleApplication requires the registered Document view.
  composition.assembleApplication({
    container: null,
    init,
    update,
    view,
    EffectsLayer: ReadRootValue.layer,
  })

  // @ts-expect-error assembleElement requires the registered Element view.
  composition.assembleElement({
    container: null,
    init,
    update,
    view: documentView,
    EffectsLayer: ReadRootValue.layer,
  })

  // @ts-expect-error The graphless Composition has not registered the child used by this view.
  ApplicationDefinition.makeComposition().assembleElement({
    container: null,
    init,
    update,
    view,
    EffectsLayer: ReadRootValue.layer,
  })

  // @ts-expect-error The graphless Composition has not registered the Mount used by this view.
  ApplicationDefinition.makeComposition().assembleElement({
    container: null,
    init,
    update,
    view: mountedView,
    EffectsLayer: Layer.merge(ReadRootValue.layer, ObserveRoot.layer),
  })

  // @ts-expect-error root handler definitions must be included in EffectsLayer.
  composition.assembleElement({
    container: null,
    init,
    update,
    view,
  })

  composition.assembleElement({
    // @ts-expect-error Model is established by makeApplicationDefinition.
    Model,
    container: null,
    init,
    update,
    view,
    EffectsLayer: ReadRootValue.layer,
  })

  const Flags = Schema.Struct({ initialValue: Schema.String })
  const initWithFlags = (flags: typeof Flags.Type) => ({
    model: {
      rootValue: flags.initialValue,
      child: { value: 'child' },
    },
  })
  const elementWithFlags = composition.assembleElement({
    Flags,
    flags: Effect.succeed({ initialValue: 'from flags' }),
    container: null,
    init: initWithFlags,
    update,
    view,
    EffectsLayer: ReadRootValue.layer,
  })
  const pendingElementWithFlags: ElementProgram<
    undefined,
    ValueSource,
    never,
    Layer.Success<typeof ReadRootValue.layer>
  > = elementWithFlags
  void pendingElementWithFlags

  const routedImplementation = {
    init: (_url: Url) => init(),
    update,
    view: documentView,
    EffectsLayer: ReadRootValue.layer,
  }
  const routedApplication = composition.assembleApplication({
    ...routedImplementation,
    container: null,
    routing: {
      onUrlRequest: request => {
        void request
        return Message.ClickedReadRootValue()
      },
      onUrlChange: url => {
        void url
        return Message.ClickedReadRootValue()
      },
    },
    devTools: { Message, mode: 'TimeTravel' },
  })
  const pendingRoutedApplication: ApplicationProgram<
    undefined,
    void,
    ValueSource,
    never,
    Layer.Success<typeof ReadRootValue.layer>
  > = routedApplication
  void pendingRoutedApplication

  const routedFlagsImplementation = {
    init: (flags: typeof Flags.Type, _url: Url) => initWithFlags(flags),
    update,
    view: documentView,
    EffectsLayer: ReadRootValue.layer,
  }
  const routedFlagsApplication = composition.assembleApplication({
    ...routedFlagsImplementation,
    Flags,
    container: null,
    routing: {
      onUrlRequest: request => {
        void request
        return Message.ClickedReadRootValue()
      },
      onUrlChange: url => {
        void url
        return Message.ClickedReadRootValue()
      },
    },
  })
  const pendingRoutedFlagsApplication: ApplicationProgram<
    undefined,
    typeof Flags.Type,
    ValueSource,
    never,
    Layer.Success<typeof ReadRootValue.layer>
  > = routedFlagsApplication
  void pendingRoutedFlagsApplication

  // @ts-expect-error a Flags application init must receive its Flags.
  composition.assembleElement({
    Flags,
    flags: Effect.succeed({ initialValue: 'from flags' }),
    container: null,
    init,
    update,
    view,
    EffectsLayer: ReadRootValue.layer,
  })
}
void typecheckRootCompletion

beforeEach(() => {
  vi.spyOn(ModelPreservationBridge, 'resolvePreservedModel').mockReturnValue(
    Effect.succeed(undefined),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('Application authoring', () => {
  it('stages primitive authoring before composition', () => {
    expectTypeOf(ApplicationDefinition.Model).toEqualTypeOf(Model)
    expectTypeOf(ApplicationDefinition.Message).toEqualTypeOf(Message)
    expect(ApplicationDefinition.command).toBeTypeOf('function')
    expect(ApplicationDefinition.mount).toBeTypeOf('function')
    expect(ApplicationDefinition.mountStream).toBeTypeOf('function')
    expect(ApplicationDefinition.resource).toBeTypeOf('function')
    expect(composition.makeUpdate).toBeTypeOf('function')
    expect(ApplicationDefinition.step).toBeTypeOf('function')
    expect(ApplicationDefinition.subscriptions).toBeTypeOf('function')
    expect(ApplicationDefinition.managedResources).toBeTypeOf('function')
    expect(composition).not.toHaveProperty('command')
    expect(composition).not.toHaveProperty('step')
    expect(composition.makeInit).toBeTypeOf('function')
    expect(init).not.toBe(initSource)
    expect(init().model).toEqual({
      rootValue: 'pending',
      child: { value: 'child' },
    })
    const recipe = initSource()

    expect(recipe).not.toBeTypeOf('function')
    expect(recipe).not.toHaveProperty('model')
    expect(recipe).not.toHaveProperty('commands')
    expect(ApplicationDefinition).not.toHaveProperty('makeInit')
    expect(ApplicationDefinition).not.toHaveProperty('makeView')
    expect(graphlessComposition).toHaveProperty('makeView')

    // @ts-expect-error an application root is not a reusable Block.
    void ApplicationDefinition.bind
    // @ts-expect-error an Application composition does not expose Block completion.
    void composition.assembleBlock
    // @ts-expect-error an application can only be composed once.
    void composition.makeComposition
  })

  it('completes an empty composition through its owned method', () => {
    expect(() =>
      NoMessageComposition.assembleElement({
        container: document.createElement('div'),
        init: noMessageInit,
        update: noMessageUpdate,
        view: noMessageElementView,
      }),
    ).not.toThrow()
  })

  it('completes the registered graph and provides only ordinary Services', async () => {
    const container = document.createElement('div')
    container.id = 'application-authoring'
    document.body.append(container)

    const element = composition.assembleElement({
      container,
      init,
      update,
      view,
      EffectsLayer: ReadRootValue.layer,
    })
    const pendingElement: ElementProgram<
      undefined,
      ValueSource,
      never,
      Layer.Success<typeof ReadRootValue.layer>
    > = element
    void pendingElement

    const runnable = element.provide(
      Layer.succeed(ValueSource, { value: 'provided' }),
    )
    const handle = embed(runnable)

    try {
      await vi.waitFor(() =>
        expect(document.body.textContent).toBe('pendingchild'),
      )
      document.querySelector('button')?.click()
      await vi.waitFor(() =>
        expect(document.body.textContent).toBe('providedchild'),
      )
    } finally {
      handle.dispose()
    }
  })
})
