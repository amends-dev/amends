import { Update } from 'foldkit'

import { AnimationBlock } from '@foldkit/ui'
import { defaultLeaveCommand } from '@foldkit/ui/animation'

import { UiDefinition } from '../definition'
import { Message } from '../message'

const foldAnimationDemoOutMessage = (
  outMessage: typeof AnimationBlock.OutMessage.Type,
  {
    liftCommand,
  }: Update.FoldContext<typeof AnimationBlock.Message.Type, Message>,
) =>
  AnimationBlock.OutMessage.match(outMessage, {
    StartedLeaveAnimating: () =>
      UiDefinition.step(model => ({
        model,
        commands: [liftCommand(defaultLeaveCommand(model.animationDemo))],
      })),
    TransitionedOut: () => UiDefinition.stepNoop(),
  })

export const AnimationDemoBinding = UiDefinition.bindChild(AnimationBlock, {
  field: 'animationDemo',
  init: { contextToArgs: () => [{ id: 'animation-demo' }] },
  outMessage: { fold: foldAnimationDemoOutMessage },
})
