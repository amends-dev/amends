import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option, Schema } from "effect"
import { makeApplicationDefinition } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import {
  Command,
  Mount,
  all,
  click,
  expect,
  expectAll,
  given,
  label,
  role,
  scene,
  text,
  type,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { button, field, submit } from "./control.ts"
import { row } from "./directory.ts"
import { type ModalRender, modal, modalList } from "./modal.ts"
import { paneTabs } from "./pane.ts"

const Message = defineMessageUnion({
  ClickedOpen: {},
  TypedName: { value: Schema.String },
  ChangedTab: { tab: Schema.Literals(["general", "members"]) },
  SubmittedSettings: {}
})
type Message = typeof Message.Type

type Model = Readonly<{ name: string; tab: "general" | "members"; saved: number }>

const initial: Model = { name: "general", tab: "general", saved: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedOpen: () => ({ model }),
    TypedName: ({ value }) => ({ model: modifyFields(model, { name: () => value }) }),
    ChangedTab: ({ tab }) => ({ model: modifyFields(model, { tab: () => tab }) }),
    SubmittedSettings: () => ({ model: modifyFields(model, { saved: (saved) => saved + 1 }) })
  })

/** What the dialog publishes while it is open, with no attribute in any group. */
const visibleRender: ModalRender<Message, never> = {
  dialog: [],
  backdrop: [],
  panel: [],
  title: [],
  description: [],
  initialFocus: [],
  closeButton: [],
  isVisible: true
}

const settingsView = (render: ModalRender<Message, never>) => (model: Model, h: HtmlBuilder<Message>) =>
  h.div([], [h.p([h.Role("status")], [`Saved ${model.saved}`]), settingsModal(render, model, h)])

const settingsModal = (render: ModalRender<Message, never>, model: Model, h: HtmlBuilder<Message>): Html =>
  modal(h, render, {
    title: "Group settings",
    context: "# general",
    description: "Changes apply to everyone in the group.",
    tabs: paneTabs(h, {
      label: "Sections",
      tabs: [
        { label: "General", isCurrent: model.tab === "general", onClick: Message.ChangedTab({ tab: "general" }) },
        {
          label: "Members",
          count: 7,
          isCurrent: model.tab === "members",
          onClick: Message.ChangedTab({ tab: "members" })
        }
      ]
    }),
    body: [
      field(
        h,
        {
          id: "group-name",
          label: "Group name",
          type: "text",
          value: model.name,
          onInput: (value) => Message.TypedName({ value }),
          isAutofocus: false,
          attributes: render.initialFocus
        },
        Option.none()
      )
    ],
    cancelLabel: "Cancel",
    footer: [submit(h, "Save changes")],
    onSubmit: Message.SubmittedSettings()
  })

describe("modal over a dialog's published groups", () => {
  it("is the title as a level 2 heading with the context after it, the description first in the body, and the tabs", () => {
    scene(
      { update, view: settingsView(visibleRender) },
      given(initial),
      expect(role("heading", { name: "Group settings", level: 2 })).toExist(),
      expect(text("# general")).toExist(),
      expect(text("Changes apply to everyone in the group.")).toExist(),
      expect(role("tablist", { name: "Sections" })).toExist(),
      expect(role("tab", { name: "Members" })).toExist(),
      expect(label("Group name")).toHaveValue("general")
    )
  })

  it("has a Close button, a Cancel button, and the footer's action, which submits the form", () => {
    scene(
      { update, view: settingsView(visibleRender) },
      given(initial),
      expect(role("button", { name: "Close" })).toExist(),
      expect(role("button", { name: "Cancel" })).toExist(),
      expect(role("button", { name: "Save changes" })).toExist(),
      expect(role("button", { name: "Save changes" })).toHaveAttr("type", "submit")
    )
  })

  it("sends its message when the footer's action submits the form, and the fields type into it", () => {
    scene(
      { update, view: settingsView(visibleRender) },
      given(initial),
      type(label("Group name"), "design"),
      expect(label("Group name")).toHaveValue("design"),
      click(role("button", { name: "Save changes" })),
      expect(role("status")).toHaveText("Saved 1"),
      click(role("tab", { name: "Members" })),
      expect(role("tab", { name: "Members" })).toHaveAttr("aria-selected", "true")
    )
  })

  it("is a panel with no form around it, and no footer, when it has neither a submit nor a footer", () => {
    scene(
      {
        update,
        view: (_, h) => modal(h, visibleRender, { title: "Heads up", body: [h.p([], ["Nothing to confirm."])] })
      },
      given(initial),
      expect(role("heading", { name: "Heads up", level: 2 })).toExist(),
      expect(text("Nothing to confirm.")).toExist(),
      expect(role("button", { name: "Close" })).toExist(),
      expect(role("button", { name: "Cancel" })).toBeAbsent(),
      expect(role("form")).toBeAbsent()
    )
  })

  it("shows nothing but its dialog element while the dialog is not visible", () => {
    scene(
      { update, view: settingsView({ ...visibleRender, isVisible: false }) },
      given(initial),
      expect(role("heading", { name: "Group settings" })).toBeAbsent(),
      expect(role("button", { name: "Close" })).toBeAbsent()
    )
  })
})

const ParentModel = Schema.Struct({
  dialog: DialogBlock.Model,
  name: Schema.String,
  saved: Schema.Finite
})

const ParentMessage = defineMessageUnion({
  ClickedOpen: {},
  TypedName: { value: Schema.String },
  SubmittedSettings: {}
})

const ParentDefinition = makeApplicationDefinition({ Model: ParentModel, Message: ParentMessage })

const foldDialogOutMessage = DialogBlock.OutMessage.match({
  Opened: () => ParentDefinition.stepNoop(),
  Closed: () => ParentDefinition.stepNoop(),
  CompletedClose: () => ParentDefinition.stepNoop()
})

const DialogBinding = ParentDefinition.bindChild(DialogBlock, {
  field: "dialog",
  init: { contextToArgs: () => [{ id: "settings-dialog" }] },
  outMessage: { fold: foldDialogOutMessage }
})

const ParentComposition = ParentDefinition.makeComposition({ bindings: [DialogBinding] })

const countSaving = ParentDefinition.stepFields(() => ({ saved: (saved: number) => saved + 1 }))

const parentUpdate = ParentComposition.makeUpdate((model, message) =>
  ParentMessage.match(message, {
    ClickedOpen: () => DialogBinding.requestOpen()(model),
    TypedName: ({ value }) => ({ model: modifyFields(model, { name: () => value }) }),
    SubmittedSettings: () => Update.combine(model, [countSaving, DialogBinding.requestClose()])
  })
)

const parentView = ParentComposition.makeView((model, h) =>
  h.div(
    [],
    [
      button(h, "Open settings", ParentMessage.ClickedOpen()),
      h.p([h.Role("status")], [`Saved ${model.saved}`]),
      h.block(
        DialogBinding.embedView({
          slotId: "settings",
          model: model.dialog,
          viewInputs: {
            hasDescription: true,
            toView: (render) =>
              modal(h, render, {
                title: "Group settings",
                context: "# general",
                description: "Changes apply to everyone in the group.",
                body: [
                  field(
                    h,
                    {
                      id: "group-name",
                      label: "Group name",
                      type: "text",
                      value: model.name,
                      onInput: (value) => ParentMessage.TypedName({ value }),
                      isAutofocus: false,
                      attributes: render.initialFocus
                    },
                    Option.none()
                  )
                ],
                cancelLabel: "Cancel",
                footer: [submit(h, "Save changes")],
                onSubmit: ParentMessage.SubmittedSettings()
              })
          }
        })
      )
    ]
  )
)

const parentInit = ParentComposition.makeInit(() => ({ model: { name: "general", saved: 0 } }))

const dialogOpened = () =>
  [
    Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
    Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources())
  ] as const

const dialogClosed = () =>
  [
    Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
    Mount.expectEnded(Dialog.test.AcquireResources)
  ] as const

describe("modal in a Block that binds the dialog", () => {
  it("is named by its title once opened, described by its description, and gone once cancelled, without submitting", () => {
    scene(
      { update: parentUpdate, view: parentView },
      given(parentInit().model),
      expect(role("heading", { name: "Group settings" })).toBeAbsent(),
      click(role("button", { name: "Open settings" })),
      ...dialogOpened(),
      expect(role("dialog", { name: "Group settings" })).toExist(),
      expect(role("dialog", { name: "Group settings" })).toHaveAttr(
        "aria-describedby",
        "settings-dialog-dialog-description"
      ),
      expect(
        within(role("dialog", { name: "Group settings" }), text("Changes apply to everyone in the group."))
      ).toExist(),
      expect(role("button", { name: "Cancel" })).toHaveAttr("type", "button"),
      click(role("button", { name: "Cancel" })),
      ...dialogClosed(),
      expect(role("heading", { name: "Group settings" })).toBeAbsent(),
      expect(role("status")).toHaveText("Saved 0")
    )
  })

  it("closes with its Close button, without submitting the form", () => {
    scene(
      { update: parentUpdate, view: parentView },
      given(parentInit().model),
      click(role("button", { name: "Open settings" })),
      ...dialogOpened(),
      click(within(role("dialog", { name: "Group settings" }), role("button", { name: "Close" }))),
      ...dialogClosed(),
      expect(role("heading", { name: "Group settings" })).toBeAbsent(),
      expect(role("status")).toHaveText("Saved 0")
    )
  })

  it("puts the dialog's initial focus on the control it was given, and keeps what is typed while open", () => {
    scene(
      { update: parentUpdate, view: parentView },
      given(parentInit().model),
      click(role("button", { name: "Open settings" })),
      ...dialogOpened(),
      expect(label("Group name")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
      type(label("Group name"), "design"),
      expect(label("Group name")).toHaveValue("design")
    )
  })

  it("sends the form's message when submitted, which the Block answers by closing the dialog", () => {
    scene(
      { update: parentUpdate, view: parentView },
      given(parentInit().model),
      click(role("button", { name: "Open settings" })),
      ...dialogOpened(),
      click(role("button", { name: "Save changes" })),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(role("status")).toHaveText("Saved 1")
    )
  })
})

describe("modalList", () => {
  const integrations = (_: Model, h: HtmlBuilder<Message>) =>
    modal(h, visibleRender, {
      title: "Add connection",
      context: "Mercier & Co",
      body: [
        modalList(h, "Integrations", [
          row(h, {
            mark: { icon: "mark-connections" },
            markSize: "md",
            title: "Anthropic",
            meta: "Models · API key",
            onClick: Message.ClickedOpen()
          }),
          row(h, {
            mark: { icon: "mark-connections" },
            markSize: "md",
            title: "MCP server",
            meta: "Tools · API key or no authentication",
            onClick: Message.ChangedTab({ tab: "members" })
          })
        ])
      ],
      cancelLabel: "Cancel"
    })

  it("is a list named by its label with a row for each, which carry their meta as their description", () => {
    scene(
      { update, view: integrations },
      given(initial),
      expect(role("list", { name: "Integrations" })).toExist(),
      expectAll(all.role("listitem")).toHaveCount(2),
      expect(role("button", { name: "Anthropic" })).toHaveAttr("aria-description", "Models · API key"),
      expect(role("button", { name: "MCP server" })).toHaveAttr(
        "aria-description",
        "Tools · API key or no authentication"
      )
    )
  })

  it("runs to the panel's edges, cancelling the body's padding on the sides and below, under a line", () => {
    scene(
      { update, view: integrations },
      given(initial),
      expect(role("list", { name: "Integrations" })).toHaveClass("-mx-6"),
      expect(role("list", { name: "Integrations" })).toHaveClass("-mb-5"),
      expect(role("list", { name: "Integrations" })).toHaveClass("border-t")
    )
  })

  it("sends what the row picked says", () => {
    scene(
      { update, view: (model, h) => h.div([], [h.p([h.Role("status")], [model.tab]), integrations(model, h)]) },
      given(initial),
      click(role("button", { name: "MCP server" })),
      expect(role("status")).toHaveText("members")
    )
  })
})
