/** Scene steps for a members picker, which every Block that has one shares: what its combobox asks of a test. */

import { Combobox } from "@foldkit/ui"
import { Command, Mount } from "foldkit/scene"
import { MembersComboboxBlock } from "../src/control/memberPicker.ts"

/** The picker acknowledged ready: the button that shows its list keeps the input from losing focus. */
export const pickerReady = Mount.resolve(
  Combobox.test.AttachPreventBlur,
  MembersComboboxBlock.Message.CompletedAttachPreventBlur()
)

/** The picker's list acknowledged open: placed against the field, with its backdrop behind it. */
export const pickerOpened = [
  Mount.resolve(Combobox.test.Anchor, MembersComboboxBlock.Message.CompletedAnchor()),
  Mount.resolve(Combobox.test.PortalBackdrop, MembersComboboxBlock.Message.CompletedPortalBackdrop())
] as const

/** A person picked in the picker: its input takes focus again, and its list stays open. */
export const pickerPicked = [
  Command.resolve(Combobox.test.FocusInput, MembersComboboxBlock.Message.CompletedFocusInput())
] as const

/**
 * The picker left the page with whatever held it: the button that shows its list is gone. A step is made for each use,
 * since one that has acknowledged a mount ending acknowledges nothing the next time.
 */
export const pickerEnded = () => Mount.expectEnded(Combobox.test.AttachPreventBlur)

/**
 * The picker's list closed, with the picker still on the page: it is no longer placed against the field, and its
 * backdrop is gone. A step is made for each use, for the reason `pickerEnded` is.
 */
export const pickerClosed = () => Mount.expectEnded(Combobox.test.Anchor, Combobox.test.PortalBackdrop)
