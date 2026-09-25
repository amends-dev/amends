# Workspace shell

Opening `/workspaces/:workspaceId` shows Home inside the app-owned workspace layout.
Nested routes provide Triage, Tasks, Environments, Connections, and
[Settings](workspace-settings.md). Settings manages workspace metadata, members, and
invitations. The other pages remain scaffolding; task data, activity, configuration operations,
dynamic Channels/Agents sections, and keyboard-shortcut help remain separate features.

Both apps compose Shell, PageHeader, Navigation, and page content through children.
The shared workspace frame uses a 256px dark sidebar at 1024px and wider and a 60px
dark rail from 768px to 1023px. Below 768px, a header toggle opens the full
navigation drawer. The drawer closes from its backdrop, Escape, or a destination link;
it has no close button or bottom navigation. The sidebar content remains mounted while
moving into that drawer. Ordinary navigation closes it; modifier clicks retain
native link behavior. A missing or removed membership shows unavailable access
outside the workspace layout. Sign-in preserves supported nested destinations.

## Screen layout reference

The `Amends Shell v2` and `Amends Screen · …` mocks in `design-system/` use 30px
horizontal gutters beside the workspace navigation and 18px on phones. The
repeated workspace page header has a location line (`Workspace / …` or
`Configure / …`) above its 34px Instrument Serif title
(26px on phones), optional actions, and compact mono metadata. Page section
pickers sit below the header as separate controls. Sign-in and workspace selection
use standalone layouts.

| Screens                                               | Content layout                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Home, Policy, Tasks                                   | One flowing column; cards or rows form internal grids and stack as space shrinks.                                                           |
| Agents, Channels, Environments, Connections, Accounts | Full-width roster or list; a selected record replaces it with a full-width view.                                                            |
| Settings                                              | Main list plus a 310px aside and 34px gap on desktop/laptop; one pane at a time on tablet/phone. Workspace forms align to the reading edge. |
| Task detail, Session, Resource                        | Main reading column plus a 300px, 290px, or 310px aside respectively on desktop/laptop; one pane at a time on tablet/phone.                 |
| Triage, Agent messages                                | Main queue or stream with an optional 400px session log or thread panel.                                                                    |
| First run                                             | Dedicated onboarding content and setup cards.                                                                                               |
| Sign in                                               | Standalone centered form outside the workspace shell.                                                                                       |

At 1280px and wider, the 256px sidebar, at least 560px of content, and the Shell
v2 400px session log can coexist. From 1024px to 1279px, that log is a deliberate
overlay and the sidebar stays full width. The smaller page asides are separate
layouts. Tablet keeps the rail and uses a navigation sheet; phone has one content
column and sheets. Settings is the last item in the shared workspace navigation.

The current apps implement the shared page frame, header, reading-edge gutters,
responsive navigation, and Settings member detail. UI also supplies the optional
400px Shell inspector for later session-log consumers. ListDetail uses the Settings
mock's 310px aside and switches to one pane on tablet/phone. Most other domain
screens remain scaffolding, so their own detail and card grids will be composed
as those features are built.

## Account and appearance

UI supplies AccountMenu parts over Popover, Avatar, IconButton, and shared controls.
Its wide panel contains identity, ThemeChoice, and app-supplied action links.
Features connects identity/sign-out to the session and theme selection to the
headless AppearanceProvider. The session currently supplies only a human identifier;
there is no profile name, photo, or Google-account integration.

The application owns an appearance source for storage and system appearance.
Client stores light/dark/system state without UI dependencies. The outer
ThemeProvider maps light to Cotton and dark to Soot; Shell receives no theme prop.
System is the default. Preference persists under `amends.appearance` in local storage,
survives sign-out, and synchronizes same-origin windows. Web and desktop origins
remain independent. Blocked storage retains the choice in memory.

Sidebar and its account popup inherit the fixed Soot scope. This follows the existing
Popover inheritance contract; the reference's always-light popup is not copied.
Theme previews show both palettes and the selected option. The branded WorkspaceMark
uses the reference persimmon pair with verified text contrast; neutral marks remain
the picker default. Shell supports manual desktop collapse for compositions that
expose its toggle; the apps keep the mock's expanded desktop sidebar. The reference
inspector remains future work.

## Verification

UI stories cover theme choice, popup interaction, long identity, and responsive
utility placement. The connected account story signs in against isolated real HTTP
and PostgreSQL data, changes appearance, and signs out without resetting it.
App tests cover nested browser/hash routes, active links, shell lifetime, directory
refresh recovery, storage failures, and system/cross-window preference updates.
Browser review covers both palettes, reload persistence, keyboard interaction,
tablet rail placement, and the popup inside the navigation drawer. Native desktop and
other platform/browser-engine validation remain separate checks.
