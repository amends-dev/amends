# Workspace shell

Opening `/workspaces/:workspaceId` shows Home inside the app-owned workspace layout.
Nested routes provide Triage, Tasks, Environments, Connections, and
[Settings](workspace-settings.md). Settings manages workspace metadata, members, and
invitations. The other pages remain scaffolding; task data, activity, configuration operations,
dynamic Channels/Agents sections, and keyboard-shortcut help remain separate features.

Both apps compose Shell and Navigation through children. SidebarUtility holds one
account control beside the expanded header and below the collapsed rail. Mobile
uses the existing drawer. Ordinary navigation closes it; modifier clicks retain
native link behavior. The sidebar stays mounted across page changes and directory
refreshes. A missing or removed membership shows unavailable access outside the
workspace layout. Sign-in preserves supported nested destinations.

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
the picker default. Sidebar collapse is retained while the app stays mounted, not
persisted across reloads. Mobile bottom navigation and the inspector remain future work.

## Verification

UI stories cover theme choice, popup interaction, long identity, and responsive
utility placement. The connected account story signs in against isolated real HTTP
and PostgreSQL data, changes appearance, and signs out without resetting it.
App tests cover nested browser/hash routes, active links, shell lifetime, directory
refresh recovery, storage failures, and system/cross-window preference updates.
Browser review covers both palettes, reload persistence, keyboard interaction,
collapsed placement, and the popup inside the mobile drawer. Native desktop and
other platform/browser-engine validation remain separate checks.
