import { ApplicationDefinition } from './definition'
import * as Room from './room'

const RoomBinding = ApplicationDefinition.bindChild(Room.RoomBlock, {
  field: 'room',
  subscriptions: {
    when: { roomKeyPresses: model => model.route._tag === 'Room' },
  },
})
