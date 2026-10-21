import { Effect, Option } from 'effect'
import { load } from 'foldkit/navigation'

import { ApplicationDefinition } from '../definition'
import { Message } from '../message'
import { HomeBlock } from '../page'
import { ExampleSlug } from '../page/example/meta'
import { playgroundRouter } from '../route'

export const LoadPlayground = ApplicationDefinition.command('LoadPlayground', {
  args: { exampleSlug: ExampleSlug },
  messages: [Message.CompletedLoadPlayground],
  handler: function* () {
    return ({ exampleSlug }) =>
      load(playgroundRouter({ exampleSlug })).pipe(
        Effect.as(Message.CompletedLoadPlayground()),
      )
  },
})

const loadPlaygroundExample = (exampleSlug: ExampleSlug) =>
  ApplicationDefinition.step(model => ({
    model,
    commands: [LoadPlayground({ exampleSlug })],
  }))

const updateNewsletterEmail = (value: string) =>
  ApplicationDefinition.stepFields(() => ({ newsletterEmail: () => value }))

const foldHomeOutMessage = HomeBlock.OutMessage.match({
  SelectedPlaygroundExample: ({ exampleSlug }) =>
    loadPlaygroundExample(exampleSlug),
  UpdatedNewsletterEmail: ({ value }) => updateNewsletterEmail(value),
})

export const HomeBinding = ApplicationDefinition.bindChild(HomeBlock, {
  field: 'maybeHome',
  init: {
    contextToArgs: ({ route }) =>
      route._tag === 'Home' ? Option.some([]) : Option.none(),
  },
  outMessage: {
    fold: foldHomeOutMessage,
  },
})
