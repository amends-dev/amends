import { Array, Option } from 'effect'
import { type Block, type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { FileDropBlock } from '@foldkit/ui'

import { AttachmentsDefinition, Message, type Model } from './definition'

const foldResumeDropOutMessage = FileDropBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  ReceivedFiles:
    ({ files }) =>
    model => ({
      model: modifyFields(model, {
        maybeResume: () =>
          Option.orElse(Array.head(files), () => model.maybeResume),
      }),
    }),
  RejectedNonFiles: () => AttachmentsDefinition.stepNoop(),
})

export const ResumeDropBinding = AttachmentsDefinition.bindChild(
  FileDropBlock,
  {
    field: 'resumeDrop',
    init: { contextToArgs: () => [{ id: 'attachments-resume' }] },
    outMessage: { fold: foldResumeDropOutMessage },
  },
)

const foldAdditionalFilesDropOutMessage = FileDropBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  ReceivedFiles:
    ({ files }) =>
    model => ({
      model: modifyFields(model, {
        additionalFiles: Array.appendAll(files),
      }),
    }),
  RejectedNonFiles: () => AttachmentsDefinition.stepNoop(),
})

export const AdditionalFilesDropBinding = AttachmentsDefinition.bindChild(
  FileDropBlock,
  {
    field: 'additionalFilesDrop',
    init: { contextToArgs: () => [{ id: 'attachments-additional' }] },
    outMessage: { fold: foldAdditionalFilesDropOutMessage },
  },
)

export const AttachmentsComposition = AttachmentsDefinition.makeComposition({
  bindings: [ResumeDropBinding, AdditionalFilesDropBinding],
})
export type AttachmentsViewBuilder = Block.ViewBuilderFor<
  typeof AttachmentsComposition
>
