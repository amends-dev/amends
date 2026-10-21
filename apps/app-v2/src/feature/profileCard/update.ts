import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { FocusTrigger } from "./command.ts"
import { ProfileCardComposition } from "./composition.ts"
import { Card, Message, type Model, openTriggerIdOf, OutMessage } from "./definition.ts"

/** The model with no card open. */
const withoutCard = (model: Model) => modifyFields(model, { card: () => Card.Closed() })

export const update = ProfileCardComposition.makeUpdate((model, message) =>
  Message.match(message, {
    RequestedOpen: ({ memberId, triggerId }) => ({
      model:
        openTriggerIdOf(model) === triggerId
          ? model
          : modifyFields(model, { card: () => Card.Reading({ subject: memberId, triggerId }) })
    }),
    ReceivedProfile: ({ profile }) => ({
      model: modifyFields(model, {
        card: (card) =>
          Card.matchOrElse(
            card,
            {
              Reading: ({ subject, triggerId }) => Card.Showing({ subject, triggerId, profile }),
              Showing: ({ subject, triggerId }) => Card.Showing({ subject, triggerId, profile })
            },
            () => card
          )
      })
    }),
    RequestedClose: () => {
      const triggerId = openTriggerIdOf(model)

      return triggerId === undefined
        ? { model }
        : { model: withoutCard(model), commands: [FocusTrigger({ triggerId })] }
    },
    LeftCard: () => ({ model: withoutCard(model) }),
    ClickedMessage: () =>
      Card.matchOrElse(
        model.card,
        {
          Showing: ({ profile }) =>
            Option.match(profile, {
              onNone: () => ({ model }),
              onSome: ({ memberId }) => ({
                model: withoutCard(model),
                outMessage: OutMessage.OpenedPerson({ memberId })
              })
            })
        },
        () => ({ model })
      ),
    ClickedOpenAgent: () =>
      Card.matchOrElse(
        model.card,
        {
          Showing: ({ profile }) =>
            Option.match(
              Option.flatMap(profile, ({ agentId }) => agentId),
              {
                onNone: () => ({ model }),
                onSome: (agentId) => ({ model: withoutCard(model), outMessage: OutMessage.OpenedAgent({ agentId }) })
              }
            )
        },
        () => ({ model })
      ),
    ClickedChangeName: () =>
      Card.matchOrElse(
        model.card,
        { Showing: () => ({ model: withoutCard(model), outMessage: OutMessage.RequestedNameChange() }) },
        () => ({ model })
      ),
    CompletedAnchorProfileCard: () => ({ model }),
    CompletedFocusTrigger: () => ({ model })
  })
)
