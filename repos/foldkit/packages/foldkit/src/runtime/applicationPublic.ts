import { assembleApplication, assembleElement } from './application.js'
import { makeDefinitionFactory } from './applicationAuthoring.js'

export type { Application, Element, PendingApplication } from './application.js'
export type {
  Composition,
  Definition,
  ViewBuilderFor,
} from './applicationAuthoring.js'

/**
 * Defines a passive Application authoring value with contextual Model and
 * Message types. Use `import { makeApplicationDefinition } from 'foldkit'` or
 * `import { makeDefinition } from 'foldkit/application'`. Establish its graph with
 * makeComposition, then complete it with assembleApplication or assembleElement.
 *
 * Definition and completion perform configuration validation. Runtime.run or
 * Runtime.embed constructs the selected Layers and starts effects later.
 */
export const makeDefinition = makeDefinitionFactory({
  assembleApplication,
  assembleElement,
})
