import { Match, Schema } from 'effect'
import { Update, makeApplicationDefinition } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Url } from 'foldkit/url'

import * as People from './informingBlocksIndex'
import { ApplicationRoute, urlToApplicationRoute } from './informingBlocksRoute'

export const Model = Schema.Struct({
  route: ApplicationRoute,
  people: People.PeopleBlock.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedUrl: { url: Url },
})
export type Message = typeof Message.Type

export const ApplicationDefinition = makeApplicationDefinition({
  Model,
  Message,
})

export const PeopleBinding = ApplicationDefinition.bindChild(
  People.PeopleBlock,
  {
    field: 'people',
    init: false,
  },
)

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [PeopleBinding],
})

const setRoute =
  (nextRoute: ApplicationRoute): Update.Step<Model, Message> =>
  model => ({ model: modifyFields(model, { route: () => nextRoute }) })

export const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ChangedUrl: ({ url }) => {
      const nextRoute = urlToApplicationRoute(url)

      return Match.value(nextRoute).pipe(
        Match.tag('People', peopleRoute =>
          Update.combine(model, [
            setRoute(nextRoute),
            PeopleBinding.informRouteChanged({ route: peopleRoute }),
          ]),
        ),
        Match.orElse(() => setRoute(nextRoute)(model)),
      )
    },
  }),
)
