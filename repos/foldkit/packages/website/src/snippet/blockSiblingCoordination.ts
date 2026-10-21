import { ApplicationDefinition } from './definition'
import * as Home from './home'
import * as Room from './room'

const foldHomeOutMessage = Home.HomeBlock.OutMessage.match({
  SelectedRoom: ({ roomId }) => RoomBinding.requestOpen(roomId),
})

export const HomeBinding = ApplicationDefinition.bindChild(Home.HomeBlock, {
  field: 'home',
  outMessage: { fold: foldHomeOutMessage },
})

const foldRoomOutMessage = Room.RoomBlock.OutMessage.match({
  SavedRoom: ({ roomId }) => HomeBinding.informRoomSaved(roomId),
})

export const RoomBinding = ApplicationDefinition.bindChild(Room.RoomBlock, {
  field: 'room',
  outMessage: { fold: foldRoomOutMessage },
})

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [HomeBinding, RoomBinding],
})
