import { type Block, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { ApplicationDefinition } from './definition'
import { Message } from './message'
import { Model } from './model'
import { StepMenuBlock, StepTabsBlock } from './navigationComponents'
import {
  AttachmentsBlock,
  CoverLetterBlock,
  EducationBlock,
  PersonalInfoBlock,
  SkillsBlock,
  WorkHistoryBlock,
} from './step'

export const PersonalInfoBinding = ApplicationDefinition.bindChild(
  PersonalInfoBlock,
  {
    field: 'personalInfo',
    init: { contextToArgs: ({ today }) => [today] },
  },
)

export const WorkHistoryBinding = ApplicationDefinition.bindChild(
  WorkHistoryBlock,
  {
    field: 'workHistory',
    init: {
      contextToArgs: ({ today, initialWorkHistoryEntryId }) => [
        today,
        initialWorkHistoryEntryId,
      ],
    },
  },
)

export const EducationBinding = ApplicationDefinition.bindChild(
  EducationBlock,
  {
    field: 'education',
    init: {
      contextToArgs: ({ today, initialEducationEntryId }) => [
        today,
        initialEducationEntryId,
      ],
    },
  },
)

export const SkillsBinding = ApplicationDefinition.bindChild(SkillsBlock, {
  field: 'skills',
  init: {
    contextToArgs: ({ initialSkillsEntryId }) => [initialSkillsEntryId],
  },
})

export const CoverLetterBinding = ApplicationDefinition.bindChild(
  CoverLetterBlock,
  {
    field: 'coverLetter',
  },
)

export const AttachmentsBinding = ApplicationDefinition.bindChild(
  AttachmentsBlock,
  {
    field: 'attachments',
  },
)

const foldStepMenuOutMessage = StepMenuBlock.OutMessage.match<
  Update.Step<Model, Message>,
  typeof StepMenuBlock.OutMessage.Type
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, { currentStep: () => value }),
    }),
  Closed: () => ApplicationDefinition.stepNoop(),
})

export const StepMenuBinding = ApplicationDefinition.bindChild(StepMenuBlock, {
  field: 'stepMenu',
  outMessage: { fold: foldStepMenuOutMessage },
  init: { contextToArgs: () => [{ id: 'step-menu' }] },
})

const foldStepTabsOutMessage = StepTabsBlock.OutMessage.match<
  Update.Step<Model, Message>,
  typeof StepTabsBlock.OutMessage.Type
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, { currentStep: () => value }),
    }),
})

export const StepTabsBinding = ApplicationDefinition.bindChild(StepTabsBlock, {
  field: 'stepTabs',
  outMessage: { fold: foldStepTabsOutMessage },
  init: { contextToArgs: () => [{ id: 'step-tabs' }] },
})

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [
    PersonalInfoBinding,
    WorkHistoryBinding,
    EducationBinding,
    SkillsBinding,
    CoverLetterBinding,
    AttachmentsBinding,
    StepMenuBinding,
    StepTabsBinding,
  ],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
