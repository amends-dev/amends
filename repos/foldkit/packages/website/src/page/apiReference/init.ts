import { ApiReferenceComposition } from './composition'
import { ApiDataAsyncData } from './domain'
import { Model } from './model'

export const init = ApiReferenceComposition.makeInit(() => ({
  model: Model.make({
    apiData: ApiDataAsyncData.Idle(),
    disclosures: {},
  }),
}))
