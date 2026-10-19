import { Block } from 'foldkit'

const OutMessage = defineMessageUnion({
  SelectedEndDate: { date: Schema.String },
  CompletedRange: { startDate: Schema.String, endDate: Schema.String },
})

const DateRangeDefinition = Block.makeDefinition('DateRange', {
  Model,
  Message,
  OutMessage,
})

const EndDatePickerBinding = DateRangeDefinition.bindChild(
  DatePicker.DatePickerBlock,
  {
    field: 'endDatePicker',
    outMessage: {
      fold: foldEndDateOutMessage,
      forward: DatePicker.DatePickerBlock.OutMessage.match({
        SelectedDate: ({ date }) => OutMessage.SelectedEndDate({ date }),
      }),
    },
  },
)

const restoreEndDate = DateRangeDefinition.step(() =>
  EndDatePickerBinding.requestRestore(),
)
