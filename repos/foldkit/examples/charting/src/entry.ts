import { Runtime } from 'foldkit'

import { ApplicationComposition } from './composition'
import { registerEcharts } from './echarts'
import { init } from './init'
import { EffectsLayer } from './layer'
import { ApplicationLayer } from './services'
import { update } from './update'
import { view } from './view'

registerEcharts()

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  EffectsLayer,
  container: document.getElementById('root'),
  devTools: { Message: ApplicationComposition.Message },
})

Runtime.run(application.provide(ApplicationLayer))
