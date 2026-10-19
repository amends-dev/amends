import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Step } from './domain'
import { StepMenuBlock, StepTabsBlock } from './navigationComponents'
import {
  AttachmentsBlock,
  CoverLetterBlock,
  EducationBlock,
  PersonalInfoBlock,
  SkillsBlock,
  WorkHistoryBlock,
} from './step'

export const Submission = defineTaggedUnion({
  NotSubmitted: {},
  Submitting: {},
  SubmitSuccess: {},
  SubmitError: { error: Schema.String },
})
export type Submission = typeof Submission.Type

export const Model = Schema.Struct({
  currentStep: Step.Step,
  personalInfo: PersonalInfoBlock.Model,
  workHistory: WorkHistoryBlock.Model,
  education: EducationBlock.Model,
  skills: SkillsBlock.Model,
  coverLetter: CoverLetterBlock.Model,
  attachments: AttachmentsBlock.Model,
  isPreviewVisible: Schema.Boolean,
  submission: Submission,
  stepMenu: StepMenuBlock.Model,
  stepTabs: StepTabsBlock.Model,
  isSubmitAttempted: Schema.Boolean,
})
export type Model = typeof Model.Type
