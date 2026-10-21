import { Option, Schema } from 'effect'
import { modifyFields } from 'foldkit/struct'

import { ApplicationDefinition } from '../definition'
import { RoomInstance } from '../model'
import { RoomBlock } from '../page'
import { ApplicationRoute } from '../route'

export const RoomBinding = ApplicationDefinition.bindChild(RoomBlock, {
  readAll: model => Option.toArray(model.maybeRoomInstance),
  key: roomInstance => roomInstance.roomId,
  keySchema: Schema.String,
  read: roomInstance => roomInstance.model,
  writeAt: (model, roomId, nextRoom) =>
    modifyFields(model, {
      maybeRoomInstance: Option.map(roomInstance =>
        roomInstance.roomId === roomId
          ? RoomInstance.make({ roomId, model: nextRoom })
          : roomInstance,
      ),
    }),
  delivery: {
    when: (model, roomId) =>
      model.route._tag === 'Room' && model.route.roomId === roomId,
    toUpdateContext: (_model, roomId) => [{ roomId }],
  },
  subscriptions: {
    when: (model, roomId) =>
      ApplicationRoute.matchOrElse(
        model.route,
        {
          Room: route => route.roomId === roomId,
        },
        () => false,
      ),
  },
})
