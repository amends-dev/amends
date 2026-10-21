import { afterEach, describe, expect, it } from "@effect/vitest"
import { anchorSetup } from "@foldkit/ui/anchor"
import { moveIntoDialogOfTrigger } from "./command.ts"

/*
 * happy-dom lays nothing out and has no top layer, so these tests read where the card is in the tree, which is what
 * decides whether a modal dialog leaves it interactive. They cannot observe the dialog being modal.
 */

/** A page with a card at its end, a trigger in the page, and a dialog holding a trigger of its own. */
const page = () => {
  document.body.innerHTML = `
    <button id="in-page">Alice</button>
    <dialog id="side-pane"><button id="in-dialog">Bob</button></dialog>
    <div id="card"></div>`

  return {
    card: document.getElementById("card")!,
    dialog: document.getElementById("side-pane")!
  }
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("a profile card's place", () => {
  it("is the dialog that holds the trigger it opened from", () => {
    const { card, dialog } = page()

    moveIntoDialogOfTrigger(card, "in-dialog")

    expect(card.parentElement).toBe(dialog)
  })

  it("is where it was drawn when its trigger is in no dialog", () => {
    const { card } = page()

    moveIntoDialogOfTrigger(card, "in-page")

    expect(card.parentElement).toBe(document.body)
  })

  it("is where it was drawn when its trigger is gone", () => {
    const { card } = page()

    moveIntoDialogOfTrigger(card, "gone")

    expect(card.parentElement).toBe(document.body)
  })

  it("is the dialog's portal root once anchored, and the page's portal root for a trigger in the page", () => {
    const { card, dialog } = page()

    moveIntoDialogOfTrigger(card, "in-dialog")
    const release = anchorSetup(card, { buttonId: "in-dialog", anchor: { placement: "bottom-start" } })

    expect(dialog.contains(card)).toBe(true)
    expect(card.closest("[data-foldkit-portal-root]")?.parentElement).toBe(dialog)

    release()

    expect(dialog.contains(card)).toBe(false)
    expect(dialog.querySelector("[data-foldkit-portal-root]")).toBeNull()

    const { card: pageCard } = page()

    moveIntoDialogOfTrigger(pageCard, "in-page")
    const releasePage = anchorSetup(pageCard, { buttonId: "in-page", anchor: { placement: "bottom-start" } })

    expect(pageCard.closest("dialog")).toBeNull()
    expect(pageCard.parentElement?.id).toBe("foldkit-portal-root")

    releasePage()
  })
})
