import { SearchDefinition } from './definition'
import { SearchState } from './domain'

export const clearSearchQuery = SearchDefinition.stepFields(() => ({
  query: () => '',
  searchState: () => SearchState.Idle(),
  activeResultIndex: () => -1,
}))
