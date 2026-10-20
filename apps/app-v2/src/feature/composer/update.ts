import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { editedText, pickMention, readMarkdown, replaceRange, type Written, writeMarkdown } from "../../mentions.ts"
import { ReadSelection, SaveDraft, SelectText } from "./command.ts"
import { ComposerComposition } from "./composition.ts"
import {
  boxId,
  isFormattingShown,
  Message,
  type Model,
  OutMessage,
  Picking,
  pickingAfterTyping,
  Reading,
  type Selection,
  writtenOf
} from "./definition.ts"
import { applyFormat } from "./format.ts"

/** Keep `written` as the draft of `model`'s place, as the markdown it says. */
const saveDraft = ({ workspaceId, memberId, place }: Model, written: Written) =>
  SaveDraft({ workspaceId, memberId, place, text: writeMarkdown(written) })

/** The selection of nothing at `at`, where the person goes on typing. */
const caretAt = (at: number): Selection => ({ from: at, to: at })

/**
 * The box holds `written`: it is kept as the draft and reported to whatever holds the composer, with the mention being
 * typed, if there is one. Given a `selection`, it is made once the box shows the text, where the person goes on typing
 * or what they go on to format, since setting the value of a box moves its caret to its end.
 */
const changeWritten = (
  model: Model,
  written: Written,
  picking: Option.Option<Picking>,
  selection: Option.Option<Selection>
) => ({
  model: modifyFields(model, {
    text: () => Option.some(written.text),
    mentions: () => written.mentions,
    picking: () => picking
  }),
  commands: [
    saveDraft(model, written),
    ...Option.toArray(Option.map(selection, ({ from, to }) => SelectText({ id: boxId(model.place), from, to })))
  ],
  outMessage: OutMessage.ChangedText({ text: writeMarkdown(written) })
})

/** The selection read, kept within the text. */
const withinText = (text: string, selection: Option.Option<Selection>): Selection =>
  Option.match(selection, {
    onNone: () => ({ from: text.length, to: text.length }),
    onSome: ({ from, to }) => ({ from: Math.min(from, text.length), to: Math.min(to, text.length) })
  })

/**
 * The mention button read where the caret is: "@" is written there, after a space unless the text before the caret ends
 * in one or is empty, in place of what was selected, the list opens for it, and the caret is after it.
 */
const startMention = (model: Model, written: Written, { from, to }: Selection) => {
  const before = written.text.slice(0, from)
  const typed = before === "" || /\s$/u.test(before) ? "@" : " @"
  const caret = from + typed.length

  return changeWritten(
    model,
    replaceRange(written, from, to, typed),
    Option.some(Picking.make({ from: caret - 1, query: "", activeIndex: 0, isDismissed: false })),
    Option.some(caretAt(caret))
  )
}

export const update = ComposerComposition.makeUpdate((model, message) =>
  Message.match(message, {
    // A draft read once the place opened fills it in, unless the person began writing there meanwhile.
    ReceivedDraft: ({ text }) =>
      Option.match(model.text, {
        onSome: () => ({ model }),
        onNone: () => {
          const read = readMarkdown(text)

          return { model: modifyFields(model, { text: () => Option.some(read.text), mentions: () => read.mentions }) }
        }
      }),
    TypedText: ({ text }) => {
      const edit = editedText(writtenOf(model), text)

      // A mention removed whole leaves the box showing more than the model holds, and the caret at its end.
      return changeWritten(
        model,
        edit.written,
        pickingAfterTyping(edit.written, edit.caret, model.picking),
        edit.written.text === text ? Option.none() : Option.some(caretAt(edit.caret))
      )
    },
    // The letters typed after the "@" become the member's name, and the list closes.
    PickedMention: ({ memberId, name }) =>
      Option.match(model.picking, {
        onNone: () => ({ model }),
        onSome: ({ from, query }) => {
          const edit = pickMention(writtenOf(model), { from, to: from + 1 + query.length }, { memberId, name })

          return changeWritten(model, edit.written, Option.none(), Option.some(caretAt(edit.caret)))
        }
      }),
    // The view counts the suggestions, so it says which one is active.
    MovedSuggestion: ({ to }) => ({
      model: modifyFields(model, {
        picking: Option.map((picking) => Picking.make({ ...picking, activeIndex: to }))
      })
    }),
    DismissedSuggestions: () => ({
      model: modifyFields(model, {
        picking: Option.map((picking) => Picking.make({ ...picking, isDismissed: true }))
      })
    }),
    // The selection is what the format is for, and it is read as it stands.
    ChoseFormat: ({ format }) => ({
      model,
      commands: [ReadSelection({ id: boxId(model.place), reading: Reading.cases.Format.make({ format }) })]
    }),
    ClickedMention: () => ({
      model,
      commands: [ReadSelection({ id: boxId(model.place), reading: Reading.cases.Mention.make({}) })]
    }),
    ClickedFormattingToggle: () => ({
      model: modifyFields(model, { formattingChoice: () => Option.some(!isFormattingShown(model)) })
    }),
    ChangedViewport: ({ viewport }) => ({ model: modifyFields(model, { viewport: () => viewport }) }),
    ReceivedSelection: ({ reading, selection }) => {
      const written = writtenOf(model)
      const selected = withinText(written.text, selection)

      return Reading.match(reading, {
        Mention: () => startMention(model, written, selected),
        Format: ({ format }) => {
          const formatted = applyFormat(written, format, selected)

          return changeWritten(model, formatted.written, Option.none(), Option.some(formatted.selection))
        }
      })
    },
    SubmittedText: () => {
      const written = writtenOf(model)
      if (written.text.trim() === "") return { model }
      return {
        model: modifyFields(model, { text: () => Option.some(""), mentions: () => [], picking: () => Option.none() }),
        commands: [saveDraft(model, { text: "", mentions: [] })],
        outMessage: OutMessage.SubmittedText({ text: writeMarkdown(written) })
      }
    },
    CompletedSaveDraft: () => ({ model }),
    CompletedSelectText: () => ({ model })
  })
)
