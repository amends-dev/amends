import { afterEach, expect, it, vi } from "@effect/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library"
import { createSignal } from "solid-js"
import { Theme } from "../src/foundations/theme/index.ts"
import { Modal } from "../src/patterns/modal/index.ts"

afterEach(cleanup)

function mount(options: { readonly closable: boolean }) {
  const [open, setOpen] = createSignal(true)
  const close = vi.fn(() => {
    if (options.closable) setOpen(false)
  })
  render(() => (
    <Theme mode="light">
      <Modal.Root open={open()} onClose={close} aria-label="Create group">
        <input aria-label="Group name" />
      </Modal.Root>
    </Theme>
  ))
  const dialog = screen.getByRole("dialog", { name: "Create group" }) as HTMLDialogElement
  return { dialog, close, open }
}

it("closes on a press on the backdrop, but not on a drag that ends there", () => {
  const { dialog, close } = mount({ closable: true })
  // Selecting text in the field and releasing outside it clicks the dialog itself.
  fireEvent.pointerDown(screen.getByRole("textbox", { name: "Group name" }))
  fireEvent.click(dialog)
  expect(close).not.toHaveBeenCalled()
  fireEvent.pointerDown(dialog)
  fireEvent.click(dialog)
  expect(close).toHaveBeenCalledTimes(1)
})

it("shows itself again when the browser closes it while the caller keeps it open", async () => {
  const { dialog, close, open } = mount({ closable: false })
  expect(dialog.open).toBe(true)
  // Such as Chrome closing it on a second Escape while a request is pending.
  dialog.close()
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  expect(open()).toBe(true)
  await waitFor(() => expect(dialog.open).toBe(true))
})

it("stays closed when the caller agrees to close", async () => {
  const { dialog, close, open } = mount({ closable: true })
  dialog.close()
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  expect(open()).toBe(false)
  expect(dialog.open).toBe(false)
})
