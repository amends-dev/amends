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
  type SidebarSubItem,
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
            mark: { text: "AM" },
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

  it("says what its count counts when the row names it, so that it is read as 5 unread and not as 5", () => {
    scene(
      {
        update,
        view: sidebarView((model, h) =>
          sidebarSection(h, {
            children: [
              sidebarItem(h, {
                icon: "mark-mail",
                label: "Inbox",
                count: 5,
                countName: "unread",
                isCurrent: model.current === "Inbox",
                onClick: open("Inbox")
              }),
              sidebarItem(h, {
                icon: "mark-triage",
                label: "Triage",
                count: 5,
                countName: "to triage",
                isCurrent: model.current === "Triage",
                onClick: open("Triage")
              }),
              sidebarItem(h, {
                icon: "mark-channel",
                label: "design",
                count: 2,
                countName: "for you",
                isCurrent: model.current === "design",
                onClick: open("design")
              }),
              sidebarItem(h, {
                icon: "mark-tasks",
                label: "Tasks",
                count: 7,
                isCurrent: model.current === "Tasks",
                onClick: open("Tasks")
              }),
              sidebarItem(h, {
                icon: "mark-settings",
                label: "Settings",
                countName: "unread",
                isCurrent: model.current === "Settings",
                onClick: open("Settings")
              })
            ]
          })
        )
      },
      given(initial),
      expect(role("button", { name: "Inbox" })).toHaveAttr("aria-description", "5 unread"),
      expect(role("button", { name: "Triage" })).toHaveAttr("aria-description", "5 to triage"),
      expect(role("button", { name: "design" })).toHaveAttr("aria-description", "2 for you"),
      expect(within(role("button", { name: "Inbox" }), text("5"))).toExist(),
      expect(within(role("button", { name: "Inbox" }), text("unread"))).toBeAbsent(),
      expect(role("button", { name: "Tasks" })).toHaveAttr("aria-description", "7"),
      expect(role("button", { name: "Settings" })).not.toHaveAttr("aria-description")
    )
  })

  it("describes a pending row by Sending… even when it names its count", () => {
    scene(
      {
        update,
        view: sidebarView((model, h) =>
          sidebarSection(h, {
            children: [
              sidebarItem(h, {
                icon: "mark-channel",
                label: "launch",
                count: 2,
                countName: "for you",
                isPending: true,
                isCurrent: model.current === "launch",
                onClick: open("launch")
              })
            ]
          })
        )
      },
      given(initial),
      expect(role("button", { name: "launch" })).toHaveAttr("aria-description", "Sending…")
    )
  })

  it("says Sending… at the end of a pending row in the count's place, and describes the row by it", () => {
    scene(
      {
        update,
        view: sidebarView((model, h) =>
          sidebarSection(h, {
            label: "Groups",
            children: [
              sidebarItem(h, {
                icon: "mark-channel",
                label: "launch",
                count: 2,
                isPending: true,
                isCurrent: model.current === "launch",
                onClick: open("launch")
              }),
              sidebarItem(h, {
                icon: "mark-channel",
                label: "general",
                count: 2,
                isCurrent: model.current === "general",
                onClick: open("general")
              }),
              sidebarItem(h, {
                icon: "mark-channel",
                label: "design",
                isPending: false,
                isCurrent: model.current === "design",
                onClick: open("design")
              })
            ]
          })
        )
      },
      given(initial),
      expect(role("button", { name: "launch" })).toHaveAttr("aria-description", "Sending…"),
      expect(within(role("button", { name: "launch" }), text("Sending…"))).toExist(),
      expect(within(role("button", { name: "launch" }), selector('span[aria-hidden="true"]'))).toHaveText("Sending…"),
      expect(within(role("button", { name: "launch" }), text("2"))).toBeAbsent(),
      expect(role("button", { name: "general" })).toHaveAttr("aria-description", "2"),
      expect(within(role("button", { name: "general" }), text("Sending…"))).toBeAbsent(),
      expect(role("button", { name: "design" })).not.toHaveAttr("aria-description"),
      expect(within(role("button", { name: "design" }), text("Sending…"))).toBeAbsent(),
      click(role("button", { name: "launch" })),
      expect(role("status")).toHaveText("Current launch, searches 0, creations 0"),
      expect(role("button", { name: "launch" })).toHaveAttr("aria-current", "page")
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

describe("sidebarItem with a status", () => {
  const needsSetup = { kind: "attention", label: "Needs setup", detail: "Its sandbox was removed." } as const

  const agentsSidebar = (model: Model, h: HtmlBuilder<Message>) =>
    sidebarSection(h, {
      label: "Agents",
      children: [
        sidebarItem(h, {
          mark: { text: "A", tone: "lilac" },
          status: { kind: "available", label: "Working in #design" },
          activity: "Working in #design",
          label: "Atlas",
          isCurrent: model.current === "Atlas",
          onClick: open("Atlas")
        }),
        sidebarItem(h, {
          mark: { text: "N", tone: "lilac" },
          label: "Nora",
          isCurrent: model.current === "Nora",
          onClick: open("Nora")
        }),
        sidebarItem(h, {
          mark: { text: "R", tone: "lilac" },
          status: needsSetup,
          label: "Review helper",
          isCurrent: model.current === "Review helper",
          onClick: open("Review helper")
        }),
        sidebarItem(h, {
          mark: { text: "Y", tone: "lilac" },
          activity: "Queued in #general",
          label: "Yumi",
          isCurrent: false,
          onClick: open("Yumi")
        })
      ]
    })

  it("is named by its label and then its status's word, and by its activity's words when it has no status", () => {
    scene(
      { update, view: sidebarView(agentsSidebar) },
      given(initial),
      expect(role("button", { name: "Atlas, Working in #design" })).toExist(),
      expect(role("button", { name: "Review helper, Needs setup" })).toExist(),
      expect(role("button", { name: "Yumi, Queued in #general" })).toExist(),
      expect(role("button", { name: "Nora" })).toExist()
    )
  })

  it("moves the logo at its end as the activity's motion says: working unless given", () => {
    scene(
      {
        update,
        view: sidebarView((_, h) =>
          sidebarSection(h, {
            label: "Agents",
            children: [
              sidebarItem(h, {
                mark: { text: "A", tone: "lilac" },
                activity: "Working in #design",
                label: "Atlas",
                isCurrent: false,
                onClick: open("Atlas")
              }),
              sidebarItem(h, {
                mark: { text: "Y", tone: "lilac" },
                activity: "Queued in #general",
                activityMotion: "thread",
                label: "Yumi",
                isCurrent: false,
                onClick: open("Yumi")
              }),
              sidebarItem(h, {
                mark: { text: "P", tone: "lilac" },
                activity: "Stopping in Jamie Morgan",
                activityMotion: "tug",
                label: "Planner",
                isCurrent: false,
                onClick: open("Planner")
              })
            ]
          })
        )
      },
      given(initial),
      expect(within(role("button", { name: "Atlas, Working in #design" }), selector("svg.logo-working"))).toExist(),
      expect(within(role("button", { name: "Yumi, Queued in #general" }), selector("svg.logo-thread"))).toExist(),
      expect(within(role("button", { name: "Yumi, Queued in #general" }), selector("svg.logo-working"))).toBeAbsent(),
      expect(within(role("button", { name: "Planner, Stopping in Jamie Morgan" }), selector("svg.logo-tug"))).toExist()
    )
  })

  it("puts the patch on the mark, with its word and why in a tooltip on hover, hidden from assistive technology like the mark", () => {
    scene(
      { update, view: sidebarView(agentsSidebar) },
      given(initial),
      expect(within(role("button", { name: "Review helper, Needs setup" }), text("R"))).not.toHaveAttr("title"),
      expect(within(role("button", { name: "Review helper, Needs setup" }), text("R"))).toHaveAttr(
        "aria-hidden",
        "true"
      ),
      expect(within(role("button", { name: "Review helper, Needs setup" }), text("R"))).toHaveClass("size-6"),
      expect(within(role("button", { name: "Review helper, Needs setup" }), text("Needs setup"))).toHaveClass(
        "text-caution-text"
      ),
      expect(
        within(role("button", { name: "Review helper, Needs setup" }), text("Its sandbox was removed."))
      ).toHaveClass("text-ink-secondary"),
      expect(within(role("button", { name: "Review helper, Needs setup" }), selector(".invisible"))).toHaveAttr(
        "aria-hidden",
        "true"
      ),
      expect(within(role("button", { name: "Nora" }), selector(".tooltip-anchor"))).toBeAbsent(),
      expect(role("img")).toBeAbsent()
    )
  })

  it("shows the logo's mark at the end of a row at work, where the count would be, and nothing for an idle one", () => {
    scene(
      { update, view: sidebarView(agentsSidebar) },
      given(initial),
      expect(within(role("button", { name: "Atlas, Working in #design" }), selector("svg"))).toHaveAttr(
        "aria-hidden",
        "true"
      ),
      expect(within(role("button", { name: "Yumi, Queued in #general" }), selector("svg"))).toExist(),
      expect(within(role("button", { name: "Nora" }), selector("svg"))).toBeAbsent(),
      expect(within(role("button", { name: "Review helper, Needs setup" }), selector("svg"))).toBeAbsent(),
      expect(role("button", { name: "Atlas, Working in #design" })).not.toHaveAttr("aria-description")
    )
  })

  it("is cut out of the surface of the row it is on while the row is hovered or current", () => {
    scene(
      { update, view: sidebarView(agentsSidebar) },
      given(initial),
      expect(role("button", { name: "Nora" })).toHaveClass("hover:[--amends-status-knockout:var(--amends-hover)]"),
      expect(role("button", { name: "Nora" })).toHaveClass(
        "aria-[current=page]:[--amends-status-knockout:var(--amends-selected)]"
      ),
      click(role("button", { name: "Review helper, Needs setup" })),
      expect(role("button", { name: "Review helper, Needs setup" })).toHaveAttr("aria-current", "page")
    )
  })

  it("shows the shape alone at the row's end for an item with no mark, and names the row by it", () => {
    scene(
      {
        update,
        view: sidebarView((_, h) =>
          sidebarSection(h, {
            label: "Models",
            children: [
              sidebarItem(h, {
                icon: "mark-connections",
                status: {
                  kind: "blocked",
                  label: "Unavailable",
                  detail: "Its integration isn't installed on this host."
                },
                label: "OpenAI-compatible",
                isCurrent: false,
                onClick: open("OpenAI-compatible")
              }),
              sidebarItem(h, { icon: "mark-connections", label: "Team", isCurrent: false, onClick: open("Team") })
            ]
          })
        )
      },
      given(initial),
      expect(role("button", { name: "OpenAI-compatible, Unavailable" })).toExist(),
      expect(within(role("button", { name: "OpenAI-compatible, Unavailable" }), text("Unavailable"))).toHaveClass(
        "text-danger-text"
      ),
      expect(
        within(
          role("button", { name: "OpenAI-compatible, Unavailable" }),
          text("Its integration isn't installed on this host.")
        )
      ).toExist(),
      expect(within(role("button", { name: "Team" }), selector(".tooltip-anchor"))).toBeAbsent()
    )
  })

  it("says Sending… in place of the activity, the status mark's shape, and the count while it is pending", () => {
    scene(
      {
        update,
        view: sidebarView((_, h) =>
          sidebarSection(h, {
            label: "Agents",
            children: [
              sidebarItem(h, {
                mark: { text: "S" },
                activity: "Working in #design",
                count: 2,
                isPending: true,
                label: "Scout",
                isCurrent: false,
                onClick: open("Scout")
              })
            ]
          })
        )
      },
      given(initial),
      expect(role("button", { name: "Scout, Working in #design" })).toHaveAttr("aria-description", "Sending…"),
      expect(within(role("button", { name: "Scout, Working in #design" }), selector("svg"))).toBeAbsent(),
      expect(within(role("button", { name: "Scout, Working in #design" }), text("2"))).toBeAbsent()
    )
  })
})

describe("sidebarItem when unread", () => {
  const groups = (model: Model, h: HtmlBuilder<Message>) =>
    sidebarSection(h, {
      label: "Groups",
      children: [
        sidebarItem(h, {
          icon: "mark-channel",
          label: "product",
          isUnread: true,
          isCurrent: model.current === "product",
          onClick: open("product")
        }),
        sidebarItem(h, {
          icon: "mark-channel",
          label: "general",
          isCurrent: model.current === "general",
          onClick: open("general")
        }),
        sidebarItem(h, {
          icon: "mark-channel",
          label: "design",
          count: 2,
          countName: "for you",
          isUnread: true,
          isCurrent: model.current === "design",
          onClick: open("design")
        }),
        sidebarItem(h, {
          icon: "mark-channel",
          label: "launch",
          isPending: true,
          isUnread: true,
          isCurrent: model.current === "launch",
          onClick: open("launch")
        })
      ]
    })

  it("closes the row with a dot, 7px and round, hidden from assistive technology, where a count would be", () => {
    scene(
      { update, view: sidebarView(groups) },
      given(initial),
      expect(within(role("button", { name: "product" }), selector("span.bg-indicator"))).toExist(),
      expect(within(role("button", { name: "product" }), selector("span.bg-indicator"))).toHaveAttr(
        "aria-hidden",
        "true"
      ),
      expect(within(role("button", { name: "product" }), selector("span.bg-indicator"))).toHaveClass("size-1.75"),
      expect(within(role("button", { name: "product" }), selector("span.bg-indicator"))).toHaveClass("rounded-full"),
      expect(within(role("button", { name: "general" }), selector("span.bg-indicator"))).toBeAbsent()
    )
  })

  it("describes the row by new activity and names it by its label alone, which a row that is read has no description of", () => {
    scene(
      { update, view: sidebarView(groups) },
      given(initial),
      expect(role("button", { name: "product" })).toHaveAttr("aria-description", "new activity"),
      expect(role("button", { name: "general" })).not.toHaveAttr("aria-description")
    )
  })

  it("reads the label in ink and medium weight, which a row that is read does not", () => {
    scene(
      { update, view: sidebarView(groups) },
      given(initial),
      expect(within(role("button", { name: "product" }), text("product"))).toHaveClass("font-medium"),
      expect(within(role("button", { name: "product" }), text("product"))).toHaveClass("text-ink"),
      expect(within(role("button", { name: "general" }), text("general"))).not.toHaveClass("font-medium"),
      expect(within(role("button", { name: "general" }), text("general"))).not.toHaveClass("text-ink")
    )
  })

  it("draws the count and not the dot when it has a count, and describes the row by the count", () => {
    scene(
      { update, view: sidebarView(groups) },
      given(initial),
      expect(within(role("button", { name: "design" }), text("2"))).toExist(),
      expect(within(role("button", { name: "design" }), selector("span.bg-indicator"))).toBeAbsent(),
      expect(role("button", { name: "design" })).toHaveAttr("aria-description", "2 for you"),
      expect(within(role("button", { name: "design" }), text("design"))).toHaveClass("font-medium")
    )
  })

  it("says Sending… in place of the dot while it is pending", () => {
    scene(
      { update, view: sidebarView(groups) },
      given(initial),
      expect(within(role("button", { name: "launch" }), text("Sending…"))).toExist(),
      expect(within(role("button", { name: "launch" }), selector("span.bg-indicator"))).toBeAbsent(),
      expect(role("button", { name: "launch" })).toHaveAttr("aria-description", "Sending…")
    )
  })

  it("draws the dot after the logo of an agent at work, and names the row by the activity's words", () => {
    scene(
      {
        update,
        view: sidebarView((_, h) =>
          sidebarSection(h, {
            label: "Direct messages",
            children: [
              sidebarItem(h, {
                mark: { text: "AT", tone: "lilac" },
                status: { kind: "available", label: "Working in #design" },
                activity: "Working in #design",
                label: "Atlas",
                isUnread: true,
                isCurrent: false,
                onClick: open("Atlas")
              })
            ]
          })
        )
      },
      given(initial),
      expect(role("button", { name: "Atlas, Working in #design" })).toHaveAttr("aria-description", "new activity"),
      expect(within(role("button", { name: "Atlas, Working in #design" }), selector("svg.logo-working"))).toExist(),
      expect(within(role("button", { name: "Atlas, Working in #design" }), selector("span.bg-indicator"))).toExist()
    )
  })
})

describe("a row under an item, with the status of a task", () => {
  const shapes = [
    ["triage", "Triage", "M8 4.6 V8.8"],
    ["progress", "Doing", "M8 3.6 A4.4 4.4 0 0 0 8 12.4 Z"],
    ["paused", "Held", "M6.5 5.8 V10.2"],
    ["dismissed", "Dismissed", "M6.2 6.2 L9.8 9.8"]
  ] as const

  const here = selector('[aria-current="page"]:not(button)')

  const under = (children: ReadonlyArray<SidebarSubItem<Message>>) => (_: Model, h: HtmlBuilder<Message>) =>
    sidebarSection(h, {
      label: "Groups",
      children: [
        sidebarItem(h, { icon: "mark-channel", label: "general", isCurrent: true, onClick: open("general"), children })
      ]
    })

  it("draws where the task stands in place of the icon, 0.875rem and hidden from assistive technology", () => {
    for (const [shape, label, path] of shapes) {
      scene(
        {
          update,
          view: sidebarView(
            under([{ taskStatus: { shape, label }, icon: "message", label: "Composer paste crash", isCurrent: true }])
          )
        },
        given(initial),
        expect(within(here, selector("svg[viewBox='0 0 16 16']"))).toHaveAttr("width", "0.875rem"),
        expect(within(here, selector("svg[viewBox='0 0 16 16']"))).toHaveAttr("aria-hidden", "true"),
        expect(within(here, selector(`svg path[d^='${path}']`))).toExist(),
        expect(within(here, selector("svg circle[r='6.4']"))).toExist(),
        expect(within(here, selector("svg[viewBox='0 0 24 24']"))).toBeAbsent()
      )
    }
  })

  it("says the status's word for assistive technology before the label, and shows no word", () => {
    scene(
      {
        update,
        view: sidebarView(
          under([{ taskStatus: { shape: "triage", label: "Triage" }, label: "Composer paste crash", isCurrent: true }])
        )
      },
      given(initial),
      expect(within(here, selector("span.sr-only"))).toHaveText("Triage, "),
      expect(within(here, text("Composer paste crash"))).toExist()
    )
  })

  it("is a button with the same drawing when it has a click, and the drawing of a finished task is ink", () => {
    scene(
      {
        update,
        view: sidebarView(
          under([
            {
              taskStatus: { shape: "done", label: "Done" },
              label: "Release notes",
              isCurrent: false,
              onClick: open("Release notes")
            }
          ])
        )
      },
      given(initial),
      expect(within(role("button", { name: /Release notes/ }), selector("svg[viewBox='0 0 16 16']"))).toHaveClass(
        "text-ink"
      ),
      expect(within(role("button", { name: /Release notes/ }), selector("svg circle"))).toHaveAttr(
        "fill",
        "currentColor"
      ),
      click(role("button", { name: /Release notes/ })),
      expect(role("status")).toHaveText("Current Release notes, searches 0, creations 0")
    )
  })

  it("draws the icon when the row has no task", () => {
    scene(
      {
        update,
        view: sidebarView(under([{ icon: "message", label: "Pricing", isCurrent: true }]))
      },
      given(initial),
      expect(within(here, selector("svg[viewBox='0 0 24 24']"))).toExist(),
      expect(within(here, selector("svg[viewBox='0 0 16 16']"))).toBeAbsent(),
      expect(within(here, selector("span.sr-only"))).toBeAbsent()
    )
  })
})

describe("sidebarSection's title", () => {
  const sectionView = (isTitleCurrent: boolean) => (_: Model, h: HtmlBuilder<Message>) =>
    sidebarSection(h, {
      label: "Agents",
      onTitleClick: open("Agents"),
      isTitleCurrent,
      actions: [iconButton(h, { icon: "list", label: "Browse agents", onClick: open("Browse") }, { size: "compact" })],
      children: []
    })

  it("is a button inside the heading that sends its message, and the actions are buttons beside it", () => {
    scene(
      { update, view: sidebarView(sectionView(false)) },
      given(initial),
      expect(within(role("heading", { name: "Agents", level: 2 }), role("button", { name: "Agents" }))).toExist(),
      expect(role("button", { name: "Agents" })).not.toHaveAttr("aria-current"),
      click(role("button", { name: "Agents" })),
      expect(role("status")).toHaveText("Current Agents, searches 0, creations 0"),
      click(role("button", { name: "Browse agents" })),
      expect(role("status")).toHaveText("Current Browse, searches 0, creations 0")
    )
  })

  it("is current while its list shows, which fills the heading like a current row", () => {
    scene(
      { update, view: sidebarView(sectionView(true)) },
      given(initial),
      expect(role("button", { name: "Agents" })).toHaveAttr("aria-current", "page"),
      expect(role("button", { name: "Agents" })).toHaveClass("aria-[current=page]:text-ink")
    )
  })

  it("is plain text, not a button, without a message, and a section with no items has no list", () => {
    scene(
      {
        update,
        view: sidebarView((_, h) => sidebarSection(h, { label: "Channels", children: [] }))
      },
      given(initial),
      expect(role("heading", { name: "Channels", level: 2 })).toExist(),
      expect(role("button", { name: "Channels" })).toBeAbsent(),
      expect(role("list")).toBeAbsent()
    )
  })
})
