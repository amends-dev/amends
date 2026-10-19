import { Socket } from 'effect/socket'

import { ApplicationDefinition } from './definition'

export const ChatSocket =
  ApplicationDefinition.resource<Socket.WebSocketLike>()('ChatSocket')
