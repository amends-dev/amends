import { modifyFields } from 'foldkit/struct'

import { FetchPeople } from './informingBlocksCommand'
import { PeopleComposition } from './informingBlocksDefinition'
import { init } from './informingBlocksInit'
import { Message } from './informingBlocksMessage'
import {
  SearchResults,
  addSearchToHistory,
  routeSearchText,
} from './informingBlocksModel'

export const informRouteChanged = Message.InformedOfRouteChange

export const update = PeopleComposition.makeUpdate((model, message) =>
  Message.match(message, {
    InformedOfRouteChange: ({ route }) => {
      const searchText = routeSearchText(route.searchText)

      return {
        model: modifyFields(model, {
          searchInput: () => searchText,
          searchHistory: history => addSearchToHistory(history, searchText),
          results: () => SearchResults.Loading(),
        }),
        commands: [FetchPeople({ searchText })],
      }
    },
    CompletedFetchPeople: ({ query, people }) => ({
      model: modifyFields(model, {
        results: () => SearchResults.Loaded({ query, people }),
      }),
    }),
  }),
)

export const PeopleBlock = PeopleComposition.assembleBlock({
  init,
  update,
  operations: { informRouteChanged },
  EffectsLayer: FetchPeople.layer,
})
