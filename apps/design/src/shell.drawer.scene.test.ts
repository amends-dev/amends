import { afterEach, beforeEach, describe, expect as expectValue, it, vi } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Effect, Layer, Schema } from "effect"
import { makeApplicationDefinition } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { Command, Mount, click, expect, given, role, scene, selector, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { mainPaneId, pane } from "./pane.ts"
import { rail } from "./rail.ts"
import { shell } from "./shell.ts"
import { currentSidebarRowSelector, sidebar, sidebarHeader, sidebarItem, sidebarSection } from "./sidebar.ts"
import { Viewport } from "./viewport.ts"

const Message = defineMessageUnion({
  ClickedHome: {},
  ClickedNavigation: {},
  ClickedWorkspaces: {},
  ClickedOpen: {}
})

const Model = Schema.Struct({
  viewport: Viewport,
  dialog: DialogBlock.Model,
  homes: Schema.Finite,
  workspaces: Schema.Finite
})

const Definition = makeApplicationDefinition({ Model, Message })

const foldDialogOutMessage = DialogBlock.OutMessage.match({
  Opened: () => Definition.stepNoop(),
  Closed: () => Definition.stepNoop(),
  CompletedClose: () => Definition.stepNoop()
})

const DialogBinding = Definition.bindChild(DialogBlock, {
  field: "dialog",
  init: { contextToArgs: () => [{ id: "workspace-menu", focusSelector: currentSidebarRowSelector }] },
  outMessage: { fold: foldDialogOutMessage }
})

const Composition = Definition.makeComposition({ bindings: [DialogBinding] })

const update = Composition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedHome: () => ({ model: modifyFields(model, { homes: (homes) => homes + 1 }) }),
    ClickedNavigation: () => ({ model }),
    ClickedWorkspaces: () => ({ model: modifyFields(model, { workspaces: (workspaces) => workspaces + 1 }) }),
    ClickedOpen: () => DialogBinding.requestOpen()(model)
  })
)

const view = Composition.makeView((model, h) =>
  shell(h, {
    viewport: model.viewport,
    rail: rail(h, {
      brand: { label: "Amends home" },
      items: [{ icon: "mark-home", label: "Home", isCurrent: true, onClick: Message.ClickedHome() }],
      footer: []
    }),
    sidebar: sidebar(h, {
      label: "Workspace",
      header: sidebarHeader(h, { mark: "M", name: "Mercier & Co", onClick: Message.ClickedWorkspaces() }),
      children: [
        sidebarSection(h, {
          children: [
            sidebarItem(h, {
              icon: "mark-mail",
              label: "Inbox",
              isCurrent: false,
              onClick: Message.ClickedNavigation()
            }),
            sidebarItem(h, {
              icon: "mark-tasks",
              label: "Tasks",
              isCurrent: true,
              onClick: Message.ClickedNavigation()
            })
          ]
        })
      ]
    }),
    main: pane(h, { variant: "main", header: { title: "Tasks" }, body: [] }),
    menu: {
      id: model.dialog.id,
      onOpen: Message.ClickedOpen(),
      isOpen: model.dialog.isOpen,
      dialog: (toView) =>
        h.block(DialogBinding.embedView({ slotId: "drawer", model: model.dialog, viewInputs: { toView } }))
    }
  })
)

const init = Composition.makeInit(() => ({ model: { viewport: "Tablet", homes: 0, workspaces: 0 } }))

const inWindow = (viewport: Viewport) => modifyFields(init().model, { viewport: () => viewport })

/** The dialog opens as the framework opens one: shown, focusing the current row of the sidebar, and its resources held. */
const drawerOpened = () =>
  [
    Command.resolve(
      Dialog.test.ShowDialog({ id: "workspace-menu", focusSelector: currentSidebarRowSelector }),
      DialogBlock.Message.SucceededShowDialog()
    ),
    Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources())
  ] as const

/** The dialog closes as the framework closes one, which returns focus to what had it when the dialog opened. */
const drawerClosed = () =>
  [
    Command.resolve(Dialog.test.CloseDialog({ id: "workspace-menu" }), DialogBlock.Message.CompletedCloseDialog()),
    Mount.expectEnded(Dialog.test.AcquireResources)
  ] as const

describe("shell over a dialog for its drawer", () => {
  it("opens the drawer from the navigation button, focusing the sidebar's current row", () => {
    for (const viewport of ["Tablet", "Phone"] as const) {
      scene(
        { update, view },
        given(inWindow(viewport)),
        expect(role("dialog", { name: "Navigation" })).toBeAbsent(),
        click(role("button", { name: "Open navigation" })),
        ...drawerOpened(),
        expect(role("dialog", { name: "Navigation" })).toHaveAttr("id", "workspace-menu"),
        expect(role("button", { name: "Open navigation" })).toHaveAttr("aria-expanded", "true"),
        expect(role("button", { name: "Open navigation" })).toHaveAttr("aria-controls", "workspace-menu")
      )
    }
  })

  it("closes the drawer with Close navigation, and returns to the navigation button that opened it", () => {
    for (const viewport of ["Tablet", "Phone"] as const) {
      scene(
        { update, view },
        given(inWindow(viewport)),
        expect(role("button", { name: "Close navigation" })).toBeAbsent(),
        click(role("button", { name: "Open navigation" })),
        ...drawerOpened(),
        expect(within(role("dialog", { name: "Navigation" }), role("button", { name: "Close navigation" }))).toExist(),
        click(within(role("dialog", { name: "Navigation" }), role("button", { name: "Close navigation" }))),
        ...drawerClosed(),
        expect(role("dialog", { name: "Navigation" })).toBeAbsent(),
        expect(role("button", { name: "Close navigation" })).toBeAbsent(),
        expect(role("button", { name: "Open navigation" })).toHaveAttr("aria-expanded", "false")
      )
    }
  })

  it("holds the sidebar in the drawer, where the selector the dialog focuses by finds its current row", () => {
    scene(
      { update, view },
      given(inWindow("Tablet")),
      click(role("button", { name: "Open navigation" })),
      ...drawerOpened(),
      expect(within(role("dialog", { name: "Navigation" }), selector(currentSidebarRowSelector))).toHaveAttr(
        "aria-label",
        "Tasks"
      ),
      expect(within(role("dialog", { name: "Navigation" }), role("button", { name: "Mercier & Co" }))).toExist()
    )
  })
})

const buttonNamed = (name: string): HTMLElement | undefined =>
  [...document.querySelectorAll("button")].find((candidate) => candidate.textContent === name)

describe("shell over a dialog in the document", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "getAnimations", { configurable: true, value: () => [] })
  })

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, "getAnimations")
    document.body.innerHTML = ""
  })

  const start = Effect.gen(function* () {
    const container = document.createElement("div")
    container.id = "drawer-app"
    document.body.append(container)
    const program = Composition.assembleElement({
      container,
      init,
      update,
      view,
      EffectsLayer: Layer.empty
    })
    yield* Effect.forkScoped(program.start())
  })

  it.live("focuses the current row when the drawer opens, and the navigation button again when it closes", () =>
    Effect.gen(function* () {
      yield* start
      yield* Effect.promise(() => vi.waitFor(() => expectValue(buttonNamed("Open navigation")).toBeDefined()))
      const toggle = buttonNamed("Open navigation")
      toggle?.focus()
      toggle?.click()

      yield* Effect.promise(() =>
        vi.waitFor(() => {
          expectValue(document.activeElement?.getAttribute("aria-label")).toBe("Tasks")
          expectValue(document.activeElement?.closest("dialog")?.getAttribute("id")).toBe("workspace-menu")
        })
      )

      buttonNamed("Close navigation")?.click()

      yield* Effect.promise(() => vi.waitFor(() => expectValue(document.activeElement).toBe(toggle)))
    })
  )

  it.live("sends focus to the main pane, which the skip link names, though the pane is not in the tab order", () =>
    Effect.gen(function* () {
      yield* start
      yield* Effect.promise(() => vi.waitFor(() => expectValue(document.getElementById(mainPaneId)).not.toBeNull()))
      const skipLink = [...document.querySelectorAll("a")].find(
        (candidate) => candidate.textContent === "Skip to content"
      )
      const main = document.getElementById(mainPaneId)

      expectValue(skipLink?.getAttribute("href")).toBe(`#${mainPaneId}`)
      expectValue(main?.tagName).toBe("MAIN")
      expectValue(main?.tabIndex).toBe(-1)
      main?.focus()
      expectValue(document.activeElement).toBe(main)
    })
  )
})
