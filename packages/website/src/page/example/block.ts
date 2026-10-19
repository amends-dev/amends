import { Option } from 'effect'

import { ExampleDetailComposition } from './composition'
import { EffectsLayer, init, update, view } from './example'
import { Message } from './message'
import type { ExampleSources } from './sources'

export { mounts } from './composition'
export {
  CurrentSourcesAsyncData,
  EffectsLayer,
  init,
  LoadExampleSources,
  Message,
  Model,
  tableOfContents,
  update,
  view,
} from './example'

export const ExampleDetailBlock = ExampleDetailComposition.assembleBlock({
  init,
  update,
  view,
  operations: {
    requestLoadInitialSources: (
      maybeInitialSlug: Option.Option<string>,
      maybeExampleSources: Option.Option<
        typeof ExampleSources.Type
      > = Option.none(),
    ) => [
      Message.RequestedLoadInitialSources({
        maybeInitialSlug,
        maybeExampleSources,
      }),
    ],
    informRouteChanged: Message.InformedOfRouteChange,
  },
  EffectsLayer,
})
