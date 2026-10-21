/**
 * Steps for scenes that open a menu and choose from it. A menu is a button that opens a list: opening it focuses the
 * list, anchors it to the button, and puts a backdrop behind it, and choosing from it closes the list, returns the
 * focus to the button, and ends the anchor and the backdrop. A scene acknowledges each, as the browser would.
 */

import * as Menu from "@foldkit/ui/menu"
import { Command, Mount, click, role } from "foldkit/scene"

/** What a menu offers to acknowledge the commands and mounts that opening and closing it start. */
type MenuAcknowledgements<
  FocusedItems extends { readonly _tag: "CompletedFocusMenuItems" },
  Anchored extends { readonly _tag: "CompletedAnchorMenu" },
  BackdropPortaled extends { readonly _tag: "CompletedPortalMenuBackdrop" },
  FocusedButton extends { readonly _tag: "CompletedFocusMenuButton" }
> = Readonly<{
  Message: Readonly<{
    CompletedFocusMenuItems: () => FocusedItems
    CompletedAnchorMenu: () => Anchored
    CompletedPortalMenuBackdrop: () => BackdropPortaled
    CompletedFocusMenuButton: () => FocusedButton
  }>
}>

/** Press the button named `buttonName` and acknowledge the list open. */
export const openMenu = <
  FocusedItems extends { readonly _tag: "CompletedFocusMenuItems" },
  Anchored extends { readonly _tag: "CompletedAnchorMenu" },
  BackdropPortaled extends { readonly _tag: "CompletedPortalMenuBackdrop" },
  FocusedButton extends { readonly _tag: "CompletedFocusMenuButton" }
>(
  menu: MenuAcknowledgements<FocusedItems, Anchored, BackdropPortaled, FocusedButton>,
  buttonName: string
) =>
  [
    click(role("button", { name: buttonName })),
    Command.resolve(Menu.test.FocusMenuItems, menu.Message.CompletedFocusMenuItems()),
    Mount.resolve(Menu.test.AnchorMenu, menu.Message.CompletedAnchorMenu()),
    Mount.resolve(Menu.test.PortalMenuBackdrop, menu.Message.CompletedPortalMenuBackdrop())
  ] as const

/**
 * Acknowledge the list closed: the focus returns to the button, and the anchor and the backdrop end. A choice reports
 * itself when the item is clicked, so a scene expects what it reports before it acknowledges this.
 */
export const acknowledgeMenuClosed = <
  FocusedItems extends { readonly _tag: "CompletedFocusMenuItems" },
  Anchored extends { readonly _tag: "CompletedAnchorMenu" },
  BackdropPortaled extends { readonly _tag: "CompletedPortalMenuBackdrop" },
  FocusedButton extends { readonly _tag: "CompletedFocusMenuButton" }
>(
  menu: MenuAcknowledgements<FocusedItems, Anchored, BackdropPortaled, FocusedButton>
) =>
  [
    Command.resolve(Menu.test.FocusMenuButton, menu.Message.CompletedFocusMenuButton()),
    Mount.expectEnded(Menu.test.AnchorMenu),
    Mount.expectEnded(Menu.test.PortalMenuBackdrop)
  ] as const

/** Choose the item named `itemName` of the open list and acknowledge the list closed. */
export const chooseMenuItem = <
  FocusedItems extends { readonly _tag: "CompletedFocusMenuItems" },
  Anchored extends { readonly _tag: "CompletedAnchorMenu" },
  BackdropPortaled extends { readonly _tag: "CompletedPortalMenuBackdrop" },
  FocusedButton extends { readonly _tag: "CompletedFocusMenuButton" }
>(
  menu: MenuAcknowledgements<FocusedItems, Anchored, BackdropPortaled, FocusedButton>,
  itemName: string
) => [click(role("menuitem", { name: itemName })), ...acknowledgeMenuClosed(menu)] as const

/** Press the button named `buttonName`, choose the item named `itemName`, and acknowledge each. */
export const chooseFromMenu = <
  FocusedItems extends { readonly _tag: "CompletedFocusMenuItems" },
  Anchored extends { readonly _tag: "CompletedAnchorMenu" },
  BackdropPortaled extends { readonly _tag: "CompletedPortalMenuBackdrop" },
  FocusedButton extends { readonly _tag: "CompletedFocusMenuButton" }
>(
  menu: MenuAcknowledgements<FocusedItems, Anchored, BackdropPortaled, FocusedButton>,
  buttonName: string,
  itemName: string
) => [...openMenu(menu, buttonName), ...chooseMenuItem(menu, itemName)] as const

/** Press the button named `buttonName` again, and acknowledge the list closed without a choice. */
export const closeMenu = <
  FocusedItems extends { readonly _tag: "CompletedFocusMenuItems" },
  Anchored extends { readonly _tag: "CompletedAnchorMenu" },
  BackdropPortaled extends { readonly _tag: "CompletedPortalMenuBackdrop" },
  FocusedButton extends { readonly _tag: "CompletedFocusMenuButton" }
>(
  menu: MenuAcknowledgements<FocusedItems, Anchored, BackdropPortaled, FocusedButton>,
  buttonName: string
) => [click(role("button", { name: buttonName })), ...acknowledgeMenuClosed(menu)] as const
