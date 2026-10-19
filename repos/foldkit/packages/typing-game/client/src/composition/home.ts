import { Effect, Option, Schema } from 'effect'
import { Update } from 'foldkit'
import { pushUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'

import * as Shared from '@typing-game/shared'

import { ApplicationDefinition } from '../definition'
import { Message } from '../message'
import { RoomInstance } from '../model'
import { HomeBlock } from '../page'
import { roomRouter } from '../route'
import { RoomBinding } from './room'

export const NavigateToRoom = ApplicationDefinition.command('NavigateToRoom', {
  args: { roomId: Schema.String },
  messages: [Message.CompletedNavigateToRoom],
  handler: function* () {
    return ({ roomId }) =>
      pushUrl(roomRouter({ roomId })).pipe(
        Effect.as(Message.CompletedNavigateToRoom()),
      )
  },
})

const navigateToRoom = (roomId: string) =>
  ApplicationDefinition.step(model => ({
    model,
    commands: [NavigateToRoom({ roomId })],
  }))

const initRoomInstance = (roomId: string) =>
  ApplicationDefinition.step(model =>
    RoomBinding.init({
      key: roomId,
      args: [Option.none()],
      toParentModel: room =>
        modifyFields(model, {
          maybeRoomInstance: () =>
            Option.some(RoomInstance.make({ roomId, model: room })),
        }),
    }),
  )

const enterJoinedRoom = (roomId: string, player: Shared.Player) =>
  Update.combine([
    initRoomInstance(roomId),
    RoomBinding.informJoined(roomId, { player }, { roomId }),
    navigateToRoom(roomId),
  ])

const foldHomeOutMessage = HomeBlock.OutMessage.match({
  CreatedRoom: ({ roomId, player }) => enterJoinedRoom(roomId, player),
  JoinedRoom: ({ roomId, player }) => enterJoinedRoom(roomId, player),
})

export const HomeBinding = ApplicationDefinition.bindChild(HomeBlock, {
  field: 'home',
  presentWhen: model => model.route._tag === 'Home',
  outMessage: { fold: foldHomeOutMessage },
})
