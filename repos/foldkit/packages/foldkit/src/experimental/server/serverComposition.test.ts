// @vitest-environment node
import { Effect, Layer, Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'

import { makeNamespace } from '../../block/define.js'
import { defineMessageUnion } from '../../message/index.js'
import { makeDefinition as makeApplicationDefinition } from '../../runtime/applicationPublic.js'
import type { Url } from '../../url/index.js'
import { renderToString } from './server.js'

const ChildNamespace = makeNamespace('ServerChild')
const ChildModel = Schema.Struct({ title: Schema.String })
const ChildMessage = defineMessageUnion({
  ClickedPrepare: {},
  CompletedPrepare: {},
  CompletedObserve: {},
})
let constructions = 0
let executions = 0
const Prepare = ChildNamespace.command('Prepare', {
  messages: [ChildMessage.CompletedPrepare],
  handler: function* () {
    yield* Effect.sync(() => {
      constructions += 1
    })

    return () =>
      Effect.sync(() => {
        executions += 1
        return ChildMessage.CompletedPrepare()
      })
  },
})
const Observe = ChildNamespace.mount('Observe', {
  messages: [ChildMessage.CompletedObserve],
  handler: function* () {
    yield* Effect.sync(() => {
      constructions += 1
    })

    return () =>
      Effect.sync(() => {
        executions += 1
        return ChildMessage.CompletedObserve()
      })
  },
})

const child = ChildNamespace.makeDefinition({
  Model: ChildModel,
  Message: ChildMessage,
}).makeComposition({ mounts: [Observe] })
const childImplementation = {
  init: (title: string) => ({ model: { title }, commands: [Prepare()] }),
  update: child.makeUpdate(model => ({ model })),
  view: child.makeView((model, h) =>
    h.button(
      [h.OnMount(Observe()), h.OnClick(ChildMessage.ClickedPrepare())],
      [model.title],
    ),
  ),
  EffectsLayer: Layer.merge(Prepare.layer, Observe.layer),
}
const childBlock = child.assembleBlock(childImplementation)
const RootModel = Schema.Struct({ title: Schema.String })
const RootApplicationDefinition = makeApplicationDefinition({
  Model: RootModel,
  Message: Schema.Never,
})
const PlainMessage = Schema.Never
const ChildBinding = RootApplicationDefinition.bindChild(childBlock, {
  read: model => Option.some(model),
  write: (_model, nextChild) => nextChild,
})
const RegisteredApplication = RootApplicationDefinition.makeComposition({
  bindings: [ChildBinding],
})
const rootImplementation = {
  init: RegisteredApplication.makeInit(() =>
    ChildBinding.init({
      args: ['Server-rendered child'],
      toParentModel: child => child,
    }),
  ),
  update: RegisteredApplication.makeUpdate(),
  view: RegisteredApplication.makeView((model, h) => ({
    title: model.title,
    body: h.div(
      [],
      [h.block(ChildBinding.embedView({ slotId: 'child', model }))],
    ),
  })),
  EffectsLayer: Layer.empty,
}

const ServerFlags = Schema.Struct({ title: Schema.String })
type ServerFlags = typeof ServerFlags.Type

const FlagsComposition = makeApplicationDefinition({
  Model: RootModel,
  Message: PlainMessage,
}).makeComposition()
const flagsImplementation = {
  init: (flags: ServerFlags) => ({ model: { title: flags.title } }),
  update: FlagsComposition.makeUpdate(),
  view: FlagsComposition.makeView((model, h) => ({
    title: model.title,
    body: h.main([], [model.title]),
  })),
  EffectsLayer: Layer.empty,
}

const RoutingComposition = makeApplicationDefinition({
  Model: RootModel,
  Message: PlainMessage,
}).makeComposition()
const routingImplementation = {
  init: (url: Url) => ({ model: { title: url.pathname } }),
  update: RoutingComposition.makeUpdate(),
  view: RoutingComposition.makeView((model, h) => ({
    title: model.title,
    body: h.main([], [model.title]),
  })),
  EffectsLayer: Layer.empty,
}

const RoutingFlagsComposition = makeApplicationDefinition({
  Model: RootModel,
  Message: PlainMessage,
}).makeComposition()
const routingFlagsImplementation = {
  init: (flags: ServerFlags, url: Url) => ({
    model: { title: `${flags.title}${url.pathname}` },
  }),
  update: RoutingFlagsComposition.makeUpdate(),
  view: RoutingFlagsComposition.makeView((model, h) => ({
    title: model.title,
    body: h.main([], [model.title]),
  })),
  EffectsLayer: Layer.empty,
}

const DataComposition = makeApplicationDefinition({
  Model: RootModel,
  Message: PlainMessage,
}).makeComposition()
const dataImplementation = {
  init: () => ({ model: { title: 'data' } }),
  update: DataComposition.makeUpdate(),
  EffectsLayer: Layer.empty,
}

const HtmlComposition = makeApplicationDefinition({
  Model: RootModel,
  Message: PlainMessage,
}).makeComposition()
const htmlImplementation = {
  init: () => ({ model: { title: 'html' } }),
  update: HtmlComposition.makeUpdate(),
  view: HtmlComposition.makeView((model, h) => h.main([], [model.title])),
  EffectsLayer: Layer.empty,
}

const OtherFlags = Schema.Struct({ count: Schema.Number })

const verifyServerBlockContracts = (): void => {
  const rootRender = renderToString(RegisteredApplication, rootImplementation, {
    isHydratable: false,
  })
  const flagsRender = renderToString(
    FlagsComposition,
    { ...flagsImplementation, Flags: ServerFlags },
    { flags: { title: 'flags' }, isHydratable: false },
  )
  const routingRender = renderToString(
    RoutingComposition,
    { ...routingImplementation, routing: {} },
    { url: 'https://foldkit.dev/docs', isHydratable: false },
  )
  const routingFlagsRender = renderToString(
    RoutingFlagsComposition,
    {
      ...routingFlagsImplementation,
      Flags: ServerFlags,
      routing: {},
    },
    {
      flags: { title: 'flags' },
      url: 'https://foldkit.dev/docs',
      isHydratable: false,
    },
  )

  const invalidDataRender = renderToString(
    DataComposition,
    // @ts-expect-error A server implementation must supply a page-owning Document view.
    dataImplementation,
    {
      isHydratable: false,
    },
  )

  const invalidHtmlRender = renderToString(
    HtmlComposition,
    // @ts-expect-error An embeddable HTML view cannot own the rendered Document.
    htmlImplementation,
    {
      isHydratable: false,
    },
  )

  const invalidFlagsValueRender = renderToString(
    FlagsComposition,
    // @ts-expect-error Render Flags must match the config's Flags Schema.
    { ...flagsImplementation, Flags: ServerFlags },
    { flags: { title: 1 }, isHydratable: false },
  )

  const invalidFlagsSchemaRender = renderToString(
    FlagsComposition,
    // @ts-expect-error The Flags Schema must match the root's init input.
    { ...flagsImplementation, Flags: OtherFlags },
    { flags: { count: 1 }, isHydratable: false },
  )

  const invalidRoutingRender = renderToString(
    RegisteredApplication,
    // @ts-expect-error A routing root must accept the parsed Url as its init input.
    { ...rootImplementation, routing: {} },
    { url: 'https://foldkit.dev', isHydratable: false },
  )

  void [
    rootRender,
    flagsRender,
    routingRender,
    routingFlagsRender,
    invalidDataRender,
    invalidHtmlRender,
    invalidFlagsValueRender,
    invalidFlagsSchemaRender,
    invalidRoutingRender,
  ]
}

void verifyServerBlockContracts

describe('Application definition server rendering', () => {
  it('renders a graphless definition created by the public define function', async () => {
    const rendered = await Effect.runPromise(
      renderToString(
        FlagsComposition,
        { ...flagsImplementation, Flags: ServerFlags },
        { flags: { title: 'Graphless root' }, isHydratable: false },
      ),
    )

    expect(rendered.title).toBe('Graphless root')
    expect(rendered.html).toContain('Graphless root')
  })

  it('renders registered child boundaries without constructing or executing handlers', async () => {
    const rendered = await Effect.runPromise(
      renderToString(RegisteredApplication, rootImplementation, {
        isHydratable: false,
      }),
    )
    expect(rendered.title).toBe('Server-rendered child')
    expect(rendered.html).toContain('Server-rendered child')
    expect(constructions).toBe(0)
    expect(executions).toBe(0)
  })
})
