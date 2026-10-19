import { Schema } from 'effect'
import { Calendar } from 'foldkit'

import { ApplicationRoute } from './route'

export const ChildInitContext = Schema.Struct({
  route: ApplicationRoute,
  today: Calendar.CalendarDate,
})
export type ChildInitContext = typeof ChildInitContext.Type
