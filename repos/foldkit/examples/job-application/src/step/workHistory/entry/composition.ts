import { Option } from 'effect'
import { Update } from 'foldkit'

import { DatePickerBlock } from '@foldkit/ui'

import { WorkHistoryEntryDefinition } from './definition'

const foldStartDateOutMessage = DatePickerBlock.OutMessage.match({
  ChangedViewMonth: () => WorkHistoryEntryDefinition.stepNoop(),
  SelectedDate: ({ date }) =>
    Update.combine([
      WorkHistoryEntryDefinition.stepFields(() => ({
        maybeStartDate: () => Option.some(date),
      })),
      EndDatePickerBinding.informMinDateChanged(Option.some(date)),
    ]),
  ClearedDate: () =>
    Update.combine([
      WorkHistoryEntryDefinition.stepFields(() => ({
        maybeStartDate: () => Option.none(),
      })),
      EndDatePickerBinding.informMinDateChanged(Option.none()),
    ]),
})

export const StartDatePickerBinding = WorkHistoryEntryDefinition.bindChild(
  DatePickerBlock,
  {
    field: 'startDate',
    init: {
      contextToArgs: ({ entryId, today }) => [
        { id: `${entryId}-start`, today },
      ],
    },
    outMessage: { fold: foldStartDateOutMessage },
  },
)

const foldEndDateOutMessage = DatePickerBlock.OutMessage.match({
  ChangedViewMonth: () => WorkHistoryEntryDefinition.stepNoop(),
  SelectedDate: ({ date }) =>
    Update.combine([
      WorkHistoryEntryDefinition.stepFields(() => ({
        maybeEndDate: () => Option.some(date),
      })),
      StartDatePickerBinding.informMaxDateChanged(Option.some(date)),
    ]),
  ClearedDate: () =>
    Update.combine([
      WorkHistoryEntryDefinition.stepFields(() => ({
        maybeEndDate: () => Option.none(),
      })),
      StartDatePickerBinding.informMaxDateChanged(Option.none()),
    ]),
})

export const EndDatePickerBinding = WorkHistoryEntryDefinition.bindChild(
  DatePickerBlock,
  {
    field: 'endDate',
    init: {
      contextToArgs: ({ entryId, today }) => [{ id: `${entryId}-end`, today }],
    },
    outMessage: { fold: foldEndDateOutMessage },
  },
)

export const WorkHistoryEntryComposition =
  WorkHistoryEntryDefinition.makeComposition({
    bindings: [StartDatePickerBinding, EndDatePickerBinding],
  })
