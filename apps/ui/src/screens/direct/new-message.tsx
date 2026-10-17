import { Show, createUniqueId } from "solid-js"
import { Button } from "../../components/button/index.ts"
import { Field } from "../../components/field/index.ts"
import { MemberPicker, type PickerPerson } from "../../components/member-picker/index.ts"
import { Modal } from "../../patterns/modal/index.ts"
import { Pane } from "../../patterns/pane/index.ts"
import * as s from "./direct.css.ts"

export interface NewMessageProps {
  readonly open: boolean
  readonly onClose: () => void
  /** Workspace members and agents the reader can message. */
  readonly candidates: ReadonlyArray<PickerPerson>
  readonly selected: ReadonlyArray<string>
  readonly onSelectedChange: (ids: Array<string>) => void
  /** The reader already has a conversation with exactly the people chosen. */
  readonly existing?: boolean
  /** Open that conversation, or start one with them. */
  readonly onConfirm: () => void
}

/** Choosing people and agents to message, in a compact modal. */
export function NewMessage(props: NewMessageProps) {
  const formId = `new-message-${createUniqueId()}`
  return (
    <Modal.Root open={props.open} onClose={() => props.onClose()} aria-label="New message" size="compact">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>New message</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Pane.Subtitle>Everyone you choose sees every thread in your conversation together.</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <form
            id={formId}
            class={s.form}
            onSubmit={(event) => {
              event.preventDefault()
              if (props.selected.length > 0) props.onConfirm()
            }}
          >
            <Field.Root>
              <Field.Label>To</Field.Label>
              <MemberPicker
                candidates={props.candidates}
                selected={props.selected}
                onSelectedChange={props.onSelectedChange}
                placeholder="Add someone…"
                autofocus
              />
            </Field.Root>
            <p class={s.note} role="status">
              {props.existing ? "You already have a conversation with them." : ""}
            </p>
          </form>
        </Pane.Body>
        <Modal.Actions>
          <Button onClick={() => props.onClose()}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" disabled={props.selected.length === 0}>
            <Show when={props.existing} fallback="Start conversation">
              Open conversation
            </Show>
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  )
}
