import { describe, it } from "@effect/vitest"
import { Schema } from "effect"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { iconButton } from "./control.ts"
import {
  sidebar,
  sidebarEmpty,
  sidebarFooter,
  sidebarHeader,
  sidebarItem,
  sidebarSection,
  sidebarSections
} from "./sidebar.ts"

const Message = defineMessageUnion({
  OpenedItem: { name: Schema.String },
  OpenedSearch: {},
  CreatedGroup: {}
})
type Message = typeof Message.Type

type Model = Readonly<{ current: string; searches: number; creations: number }>

const initial: Model = { current: "Inbox", searches: 0, creations: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    OpenedItem: ({ name }) => ({ model: modifyFields(model, { current: () => name }) }),
    OpenedSearch: () => ({ model: modifyFields(model, { searches: (searches) => searches + 1 }) }),
    CreatedGroup: () => ({ model: modifyFields(model, { creations: (creations) => creations + 1 }) })
  })

const open = (name: string) => Message.OpenedItem({ name })

const sidebarView =
  (render: (model: Model, h: HtmlBuilder<Message>) => Html) => (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [],
      [
        h.p([h.Role("status")], [`Current ${model.current}, searches ${model.searches}, creations ${model.creations}`]),
        render(model, h)
      ]
    )

const workspaceSidebar = (model: Model, h: HtmlBuilder<Message>) =>
  sidebar(h, {
    label: "Workspace",
    header: sidebarHeader(h, {
      mark: "M",
      name: "Mercier & Co",
      actions: [iconButton(h, { icon: "mark-menu", label: "Switch workspace", onClick: open("Switch") })],
      search: { label: "Find anything…", shortcut: "⌘ K", onClick: Message.OpenedSearch() }
    }),
    children: [
      sidebarSection(h, {
        children: [
          sidebarItem(h, {
            icon: "mark-mail",
            label: "Inbox",
            count: 3,
            isCurrent: model.current === "Inbox",
            onClick: open("Inbox")
          }),
          sidebarItem(h, {
            icon: "mark-triage",
            label: "Triage",
            isCurrent: model.current === "Triage",
            onClick: open("Triage")
          })
        ]
      }),
      sidebarSection(h, {
        label: "Groups",
        actions: [iconButton(h, { icon: "mark-new", label: "Create group", onClick: Message.CreatedGroup() })],
        children: [
          sidebarItem(h, {
            icon: "mark-channel",
            label: "general",
            isCurrent: model.current === "general",
            onClick: open("general"),
            children: [
              {
                icon: "circle-frame",
                label: "Composer paste crash",
                isCurrent: model.current === "Composer paste crash",
                onClick: open("Composer paste crash")
              }
            ]
          })
        ]
      }),
      sidebarSection(h, {
        label: "Direct messages",
        children: [
          sidebarItem(h, {
            mark: "AM",
            label: "Alex Morgan",
            isCurrent: model.current === "Alex Morgan",
            onClick: open("Alex Morgan")
          })
        ]
      }),
      sidebarSection(h, { label: "Invitations", children: [sidebarEmpty(h, "No invitations")] })
    ],
    footer: sidebarFooter(h, [h.p([], ["12 members · as Alex"])])
  })

describe("sidebar", () => {
  it("is a navigation landmark named by its label, holding its header, sections, and footer", () => {
    scene(
      { update, view: sidebarView(workspaceSidebar) },
      given(initial),
      expect(role("navigation", { name: "Workspace" })).toExist(),
      expect(within(role("navigation", { name: "Workspace" }), text("Mercier & Co"))).toExist(),
      expect(within(role("navigation", { name: "Workspace" }), text("12 members · as Alex"))).toExist()
    )
  })

  it("opens a search from the header and keeps its action buttons by name", () => {
    scene(
      { update, view: sidebarView(workspaceSidebar) },
      given(initial),
      click(role("button", { name: "Find anything…" })),
      expect(role("status")).toHaveText("Current Inbox, searches 1, creations 0"),
      expect(role("button", { name: "Switch workspace" })).toExist()
    )
  })

  it("labels each section with a heading and puts its actions beside it", () => {
    scene(
      { update, view: sidebarView(workspaceSidebar) },
      given(initial),
      expect(role("heading", { name: "Groups", level: 2 })).toExist(),
      expect(role("heading", { name: "Direct messages", level: 2 })).toExist(),
      click(role("button", { name: "Create group" })),
      expect(role("status")).toHaveText("Current Inbox, searches 0, creations 1")
    )
  })

  it("marks the current item with aria-current and shows its count, and the current item follows a click", () => {
    scene(
      { update, view: sidebarView(workspaceSidebar) },
      given(initial),
      expect(role("button", { name: "Inbox" })).toHaveAttr("aria-current", "page"),
      expect(role("button", { name: "Inbox" })).toHaveAttr("aria-description", "3"),
      expect(within(role("button", { name: "Inbox" }), text("3"))).toExist(),
      expect(role("button", { name: "Triage" })).not.toHaveAttr("aria-current"),
      click(role("button", { name: "Triage" })),
      expect(role("button", { name: "Triage" })).toHaveAttr("aria-current", "page"),
      expect(role("button", { name: "Inbox" })).not.toHaveAttr("aria-current")
    )
  })

  it("names a person's item by their name, not by the letters on its mark", () => {
    scene(
      { update, view: sidebarView(workspaceSidebar) },
      given(initial),
      expect(role("button", { name: "Alex Morgan" })).toExist(),
      expect(within(role("button", { name: "Alex Morgan" }), text("AM"))).toExist()
    )
  })

  it("nests an item's children under it, and each is a button that can be current", () => {
    scene(
      { update, view: sidebarView(workspaceSidebar) },
      given(initial),
      expect(role("button", { name: "Composer paste crash" })).not.toHaveAttr("aria-current"),
      click(role("button", { name: "Composer paste crash" })),
      expect(role("button", { name: "Composer paste crash" })).toHaveAttr("aria-current", "page"),
      expect(role("status")).toHaveText("Current Composer paste crash, searches 0, creations 0")
    )
  })

  it("says so in a quiet line when a section has no items", () => {
    scene(
      { update, view: sidebarView(workspaceSidebar) },
      given(initial),
      expect(role("heading", { name: "Invitations" })).toExist(),
      expect(text("No invitations")).toExist()
    )
  })

  it("takes a header with no search and an unlabelled section", () => {
    scene(
      {
        update,
        view: sidebarView((_, h) =>
          sidebar(h, {
            label: "Settings",
            header: sidebarHeader(h, { mark: "M", name: "Mercier & Co" }),
            children: [
              sidebarSection(h, {
                children: [
                  sidebarItem(h, { icon: "mark-settings", label: "General", isCurrent: true, onClick: open("General") })
                ]
              })
            ]
          })
        )
      },
      given(initial),
      expect(role("button", { name: "General" })).toHaveAttr("aria-current", "page"),
      expect(role("heading")).toBeAbsent()
    )
  })

  it("shows a row under an item with no click as a plain row, not a button, that says where the person is", () => {
    scene(
      {
        update,
        view: sidebarView((_, h) =>
          sidebar(h, {
            label: "Workspace",
            header: sidebarHeader(h, { mark: "M", name: "Mercier & Co" }),
            children: [
              sidebarSection(h, {
                label: "Groups",
                children: [
                  sidebarItem(h, {
                    icon: "mark-channel",
                    label: "general",
                    isCurrent: true,
                    onClick: open("general"),
                    children: [
                      { icon: "circle-frame", label: "Composer paste crash", isCurrent: true },
                      { label: "Release notes", isCurrent: false }
                    ]
                  })
                ]
              })
            ]
          })
        )
      },
      given(initial),
      expect(role("button", { name: "Composer paste crash" })).toBeAbsent(),
      expect(role("button", { name: "Release notes" })).toBeAbsent(),
      expect(within(selector('[aria-current="page"]:not(button)'), text("Composer paste crash"))).toExist(),
      expect(within(selector("li"), text("Release notes"))).toExist(),
      expect(role("button", { name: "general" })).toHaveAttr("aria-current", "page")
    )
  })
})

describe("sidebarSections", () => {
  const blockSections = (model: Model, h: HtmlBuilder<Message>) =>
    sidebarSections(h, [
      sidebarSection(h, {
        label: "Groups",
        children: [
          sidebarItem(h, {
            icon: "mark-channel",
            label: "general",
            isCurrent: model.current === "general",
            onClick: open("general")
          })
        ]
      }),
      sidebarSection(h, { label: "Direct messages", children: [sidebarEmpty(h, "No messages yet")] })
    ])

  it("lies among the sidebar's own sections, whose headings, items, and empty lines all show in the one landmark", () => {
    scene(
      {
        update,
        view: sidebarView((model, h) =>
          sidebar(h, {
            label: "Workspace",
            header: sidebarHeader(h, { mark: "M", name: "Mercier & Co" }),
            children: [
              sidebarSection(h, {
                children: [
                  sidebarItem(h, { icon: "mark-mail", label: "Inbox", isCurrent: true, onClick: open("Inbox") })
                ]
              }),
              blockSections(model, h)
            ]
          })
        )
      },
      given(initial),
      expect(within(role("navigation", { name: "Workspace" }), role("button", { name: "Inbox" }))).toExist(),
      expect(
        within(role("navigation", { name: "Workspace" }), role("heading", { name: "Groups", level: 2 }))
      ).toExist(),
      expect(role("heading", { name: "Direct messages", level: 2 })).toExist(),
      expect(text("No messages yet")).toExist(),
      click(role("button", { name: "general" })),
      expect(role("button", { name: "general" })).toHaveAttr("aria-current", "page"),
      expect(role("button", { name: "Inbox" })).toHaveAttr("aria-current", "page")
    )
  })
})
