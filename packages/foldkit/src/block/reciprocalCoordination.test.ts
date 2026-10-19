import { Array, Context, Effect, Layer, Option, Schema, Tuple } from 'effect'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import { defineMessageUnion } from '../message/index.js'
import { defineRouteUnion } from '../route/index.js'
import { modifyFields } from '../struct/index.js'
import * as Update from '../update/index.js'
import * as Block from './public.js'

class DraftStore extends Context.Service<
  DraftStore,
  Readonly<{ clear: Effect.Effect<void> }>
>()('ReciprocalDraftStore') {}
const HomeModel = Schema.Struct({
  username: Schema.String,
  resetCount: Schema.Number,
})
const HomeMessage = defineMessageUnion({
  RequestedResetJoinForm: { username: Schema.String },
  RequestedJoin: { roomId: Schema.String, username: Schema.String },
  SucceededJoinRoom: { roomId: Schema.String, username: Schema.String },
  CompletedClearJoinDraft: {},
})
const HomeOutMessage = defineMessageUnion({
  JoinedRoom: { roomId: Schema.String, username: Schema.String },
})
const Home = Block.makeDefinition('Home', {
  Model: HomeModel,
  Message: HomeMessage,
  OutMessage: HomeOutMessage,
})
const ClearJoinDraft = Home.command('ClearJoinDraft', {
  messages: [HomeMessage.CompletedClearJoinDraft],
  handler: function* () {
    const store = yield* DraftStore
    return () =>
      store.clear.pipe(Effect.as(HomeMessage.CompletedClearJoinDraft()))
  },
})
const HomeComposition = Home.makeComposition()
const resetJoinForm = Home.step((model, username: string) => ({
  model: modifyFields(model, {
    username: () => username,
    resetCount: count => count + 1,
  }),
  commands: [ClearJoinDraft()],
}))
const requestJoin = Home.step((model, roomId: string, username: string) => ({
  model,
  outMessage: HomeOutMessage.JoinedRoom({ roomId, username }),
}))
const HomeBlock = HomeComposition.assembleBlock({
  init: HomeComposition.makeInit(() => ({
    model: HomeModel.make({ username: '', resetCount: 0 }),
  })),
  update: HomeComposition.makeUpdate((model, message) =>
    HomeMessage.match(message, {
      RequestedResetJoinForm: ({ username }) => resetJoinForm(model, username),
      RequestedJoin: ({ roomId, username }) =>
        requestJoin(model, roomId, username),
      SucceededJoinRoom: ({ roomId, username }) => ({
        model,
        outMessage: HomeOutMessage.JoinedRoom({ roomId, username }),
      }),
      CompletedClearJoinDraft: () => ({ model }),
    }),
  ),
  operations: {
    resetJoinForm: (username: string) =>
      Tuple.make(HomeMessage.RequestedResetJoinForm({ username })),
    requestJoin: (roomId: string, username: string) =>
      Tuple.make(HomeMessage.RequestedJoin({ roomId, username })),
  },
  EffectsLayer: ClearJoinDraft.layer,
})

const RoomModel = Schema.Struct({ maybeUsername: Schema.Option(Schema.String) })
const RoomContext = Schema.Struct({ roomId: Schema.String })
const RoomMessage = defineMessageUnion({
  RequestedInformJoined: { username: Schema.String },
  CompletedLeaveRoom: {},
})
const RoomOutMessage = defineMessageUnion({
  LeftRoom: { roomId: Schema.String },
})
const Room = Block.makeDefinition('Room', {
  Model: RoomModel,
  Message: RoomMessage,
  OutMessage: RoomOutMessage,
})
const RoomComposition = Room.makeComposition()
const informJoined = Room.step(
  (model, username: string, _context: typeof RoomContext.Type) => ({
    model: modifyFields(model, { maybeUsername: () => Option.some(username) }),
  }),
)
const RoomBlock = RoomComposition.assembleBlock({
  init: RoomComposition.makeInit(() => ({
    model: RoomModel.make({ maybeUsername: Option.none() }),
  })),
  update: RoomComposition.makeUpdate(
    (model, message, context: typeof RoomContext.Type) =>
      RoomMessage.match(message, {
        RequestedInformJoined: ({ username }) =>
          informJoined(model, username, context),
        CompletedLeaveRoom: () => ({
          model,
          outMessage: RoomOutMessage.LeftRoom({ roomId: context.roomId }),
        }),
      }),
  ),
  operations: {
    informJoined: (username: string, context: typeof RoomContext.Type) =>
      Tuple.make(RoomMessage.RequestedInformJoined({ username }), context),
  },
  EffectsLayer: Layer.empty,
})

const ApplicationRoute = defineRouteUnion({
  Home: {},
  Room: { roomId: Schema.String },
})
const RoomInstance = Schema.Struct({ roomId: Schema.String, model: RoomModel })
const Model = Schema.Struct({
  home: HomeModel,
  maybeRoomInstance: Schema.Option(RoomInstance),
  route: ApplicationRoute,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  RequestedJoin: { roomId: Schema.String, username: Schema.String },
  RequestedResetJoinForm: { username: Schema.String },
})
type Message = typeof Message.Type
const Application = Block.makeDefinition('ReciprocalApplication', {
  Model,
  Message,
})

const foldRoomOutMessage = (
  _roomId: string,
  outMessage: typeof RoomOutMessage.Type,
) =>
  RoomOutMessage.match(outMessage, {
    LeftRoom: () =>
      Update.combine([
        Application.step(model => ({
          model: modifyFields(model, {
            route: () => ApplicationRoute.Home(),
            maybeRoomInstance: () => Option.none(),
          }),
        })),
        HomeBinding.resetJoinForm(''),
      ]),
  })

const foldHomeOutMessage = (outMessage: typeof HomeOutMessage.Type) =>
  HomeOutMessage.match(outMessage, {
    JoinedRoom: ({ roomId, username }) =>
      Update.combine([
        Application.step(model =>
          RoomBinding.init({
            key: roomId,
            args: [],
            toParentModel: room =>
              modifyFields(model, {
                maybeRoomInstance: () =>
                  Option.some(RoomInstance.make({ roomId, model: room })),
              }),
          }),
        ),
        RoomBinding.informJoined(roomId, username, { roomId }),
        Application.step(model => ({
          model: modifyFields(model, {
            route: () => ApplicationRoute.Room({ roomId }),
          }),
        })),
      ]),
  })

const HomeBinding = Application.bindChild(HomeBlock, {
  field: 'home',
  presentWhen: model => model.route._tag === 'Home',
  init: false,
  outMessage: {
    fold: foldHomeOutMessage,
  },
})

const RoomBinding = Application.bindChild(RoomBlock, {
  readAll: model => Option.toArray(model.maybeRoomInstance),
  key: instance => instance.roomId,
  read: instance => instance.model,
  writeAt: (model, roomId, nextRoom) =>
    modifyFields(model, {
      maybeRoomInstance: Option.map(instance =>
        instance.roomId === roomId
          ? modifyFields(instance, { model: () => nextRoom })
          : instance,
      ),
    }),
  keySchema: Schema.String,
  delivery: {
    when: (model, roomId) =>
      model.route._tag === 'Room' && model.route.roomId === roomId,
    toUpdateContext: (_model, roomId) => [{ roomId }],
  },
  outMessage: {
    fold: foldRoomOutMessage,
  },
})

const ApplicationComposition = Application.makeComposition({
  bindings: [HomeBinding, RoomBinding],
})
const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    RequestedJoin: ({ roomId, username }) =>
      HomeBinding.requestJoin(roomId, username)(model),
    RequestedResetJoinForm: ({ username }) =>
      HomeBinding.resetJoinForm(username)(model),
  }),
)
const makeInitialModel = () =>
  Model.make({
    home: HomeModel.make({ username: 'Devin', resetCount: 0 }),
    maybeRoomInstance: Option.none(),
    route: ApplicationRoute.Home(),
  })
const directHomeRequest = HomeBinding.requestJoin('room-a', 'Devin')

// @ts-expect-error A raw recipe cannot erase its deferred Binding policy obligation.
const erasedDirectHomeRequest: (
  model: Parameters<typeof directHomeRequest>[0],
) => Update.ResultRecipe<
  Model,
  Parameters<typeof update>[1],
  never,
  Update.RequirementsOf<typeof directHomeRequest>,
  Block.RequirementOfBinding<typeof HomeBinding>
> = directHomeRequest

const widenedDirectHomeRequest: (
  model: Parameters<typeof directHomeRequest>[0],
) => Update.ResultRecipe<
  Model,
  Parameters<typeof update>[1],
  never,
  Update.RequirementsOf<typeof directHomeRequest>,
  unknown
> = directHomeRequest

// @ts-expect-error Composition init rejects a recipe whose Binding policy obligation was widened away.
ApplicationComposition.makeInit(() => ({
  model: makeInitialModel(),
  steps: [widenedDirectHomeRequest],
}))

void erasedDirectHomeRequest
const ApplicationBlock = ApplicationComposition.assembleBlock({
  init: ApplicationComposition.makeInit(() => ({ model: makeInitialModel() })),
  update,
  operations: {
    requestJoin: (roomId: string, username: string) =>
      Tuple.make(Message.RequestedJoin({ roomId, username })),
    resetJoinForm: (username: string) =>
      Tuple.make(Message.RequestedResetJoinForm({ username })),
  },
})
const joinRoom = (model: typeof Model.Type) =>
  update(model, {
    _tag: 'GotHomeMessage',
    placement: 'home',
    generation: 0,
    message: HomeMessage.SucceededJoinRoom({
      roomId: 'room-a',
      username: 'Devin',
    }),
  })
const leaveRoom = (model: typeof Model.Type, roomId = 'room-a') =>
  update(model, {
    _tag: 'GotRoomMessage',
    placement: 'Room',
    generation: 0,
    key: roomId,
    message: RoomMessage.CompletedLeaveRoom(),
  })

describe('reciprocal sibling coordination', () => {
  it.each([
    {
      name: 'missing',
      policy: undefined,
      error: 'requires an outMessage policy with a fold or forward function',
    },
    {
      name: 'empty',
      policy: {},
      error: 'An OutMessage policy requires a fold or forward function',
    },
    {
      name: 'non-callable',
      policy: { fold: 1 },
      error: 'outMessage.fold must be a function',
    },
    {
      name: 'forwarding without a parent contract',
      policy: { forward: () => undefined },
      error:
        'outMessage.forward requires an OutMessage Schema on the parent Definition',
    },
  ])(
    'rejects $name OutMessage policy from erased configuration',
    ({ policy, error }) => {
      const config = {
        field: 'home',
        ...(policy === undefined ? {} : { outMessage: policy }),
      }

      expect(() =>
        Reflect.apply(Application.bindChild, undefined, [HomeBlock, config]),
      ).toThrow(error)
    },
  )

  it('validates a policy without calling it during Binding construction', () => {
    const fold = vi.fn(() => Application.step(model => ({ model })))

    Reflect.apply(Application.bindChild, undefined, [
      HomeBlock,
      {
        field: 'home',
        outMessage: { fold },
      },
    ])

    expect(fold).not.toHaveBeenCalled()
  })

  it('keeps construction passive and coordinates Home into a keyed Room', () => {
    const initialModel = makeInitialModel()
    expect(initialModel.home.resetCount).toBe(0)
    expect(initialModel.maybeRoomInstance).toEqual(Option.none())

    const joined = joinRoom(initialModel)

    expect(joined.model.route).toEqual(
      ApplicationRoute.Room({ roomId: 'room-a' }),
    )
    expect(joined.model.maybeRoomInstance).toEqual(
      Option.some(
        RoomInstance.make({
          roomId: 'room-a',
          model: RoomModel.make({ maybeUsername: Option.some('Devin') }),
        }),
      ),
    )
    expect(joined.model.home.resetCount).toBe(0)
    expect(joined.commands ?? []).toHaveLength(0)
  })

  it('returns Home before its guarded operation and retains the lifted Command', async () => {
    const clear = vi.fn()
    const joined = joinRoom(makeInitialModel())
    const left = leaveRoom(joined.model)

    expect(left.model.route).toEqual(ApplicationRoute.Home())
    expect(left.model.maybeRoomInstance).toEqual(Option.none())
    expect(left.model.home).toEqual(
      HomeModel.make({ username: '', resetCount: 1 }),
    )
    expect(left.commands).toHaveLength(1)
    expect(clear).not.toHaveBeenCalled()
    expectTypeOf(left.model).toEqualTypeOf<typeof Model.Type>()

    const command = Option.getOrThrow(Array.head(left.commands ?? []))
    const completed = await Effect.runPromise(
      command.effect.pipe(
        Effect.provide(ApplicationBlock.EffectsLayer),
        Effect.provideService(DraftStore, { clear: Effect.sync(clear) }),
      ),
    )

    expect(clear).toHaveBeenCalledTimes(1)
    expect(completed).toEqual({
      _tag: 'GotHomeMessage',
      placement: 'home',
      generation: 0,
      message: HomeMessage.CompletedClearJoinDraft(),
    })
    expect(update(left.model, completed).model).toEqual(left.model)
  })

  it('ignores stale Room results and a Home operation while Home is absent', () => {
    const joined = joinRoom(makeInitialModel())
    const stale = leaveRoom(joined.model, 'removed-room')
    const absentHome = ApplicationBlock.operations.resetJoinForm(
      joined.model,
      'ignored',
    )

    expect(stale.model).toBe(joined.model)
    expect(stale.commands ?? []).toHaveLength(0)
    expect(absentHome.model).toBe(joined.model)
    expect(absentHome.commands ?? []).toHaveLength(0)
  })

  it('retains the OutMessage policy for an operation that emits an OutMessage', () => {
    const joined = ApplicationBlock.operations.requestJoin(
      makeInitialModel(),
      'requested-room',
      'Sam',
    )

    expect(joined.model.route).toEqual(
      ApplicationRoute.Room({ roomId: 'requested-room' }),
    )
    expect(joined.model.maybeRoomInstance).toEqual(
      Option.some(
        RoomInstance.make({
          roomId: 'requested-room',
          model: RoomModel.make({ maybeUsername: Option.some('Sam') }),
        }),
      ),
    )
    expect(joined.outMessage).toBeUndefined()
  })

  it('does not bounce a non-emitting sibling operation back through its policy', () => {
    const joined = joinRoom(makeInitialModel())
    const left = leaveRoom(joined.model)
    const repeated = leaveRoom(left.model)

    expect(left.model.home.resetCount).toBe(1)
    expect(repeated.model).toBe(left.model)
    expect(repeated.commands ?? []).toHaveLength(0)
  })
})
