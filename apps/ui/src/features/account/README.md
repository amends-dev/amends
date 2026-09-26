# Account menu

Compose Root, Trigger, Content, Identity, and Actions as nested children. Action is a
menu button set like Link that closes the panel and returns focus to the trigger before
calling back, for actions such as changing one's name that open something of their own; a
dialog it opens then hands focus back to the trigger. Content
uses Popover's wide panel and should contain Identity or another accessible title.
Place ThemeChoice and Divider between identity and actions. Link takes a native
href; SignOut takes a callback. UI reads no session, route, or preferences.

This is an anchored nonmodal dialog containing settings and actions. Theme choices
stay open; Escape returns focus to the trigger. Unmodified destination links close
the panel; modifier, download, and new-window links retain native behavior. SignOut
delegates session changes to the caller. Identity takes an identifier and initials, and an
optional name that leads with the identifier beneath it; it does not fabricate profile
details or Google-account links.

The panel inherits its trigger's theme and modal host. A sidebar trigger therefore
produces a Soot popup in both app themes, intentionally adapting the light mock to
the existing Popover contract. Stories cover open/light/dark, long identity,
interaction, and focus return; Named and NamedAction show a name and an action closing the
panel. Shell Utility covers rail and drawer placement.
