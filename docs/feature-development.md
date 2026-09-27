# Feature development

Build each feature through the stack and verify it independently before adding it
to an application page. [Sign-in](sign-in-design.md) is the first slice.

## Ownership

| Location                   | Owns                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------- |
| Backend and HTTP packages  | Business rules, host capabilities, contracts, and handlers.                           |
| `apps/client`              | Headless operations, request state, session lifetime, and view hooks for each screen. |
| `apps/ui-v2`               | Reusable visual components, patterns, and presentational screens.                     |
| `apps/web`, `apps/desktop` | Route trees, page composition, navigation, configuration, and platform integration.   |

Client and UI remain independent. A client view hook shapes state into what a screen shows,
as codes rather than wording, and exposes the screen's actions; the screen takes data and
callbacks and owns its wording. Each app's page passes one to the other and owns only routing
and which dialog is open.

Compose through nested children and named parts, such as `Pane.Root` containing
`Pane.Header` and `Pane.Body`. Props carry data and callbacks, rather
than complete components. Application pages live in web and desktop.

Apps contain no styling. First inspect shared UI (including Shell), identify any
missing capability, and decide whether it is a valid reusable addition to the
design system. Verify that piece in UI before composing it into an app page.

## Build and verify

1. Establish backend behavior and its HTTP contract; reuse what already exists.
2. Add headless client operations and view hooks, with tests for their state and lifetime
   over a scripted HTTP transport, including conflicts, lost responses, and failed refreshes.
3. Introduce needed UI pieces one at a time, with isolated Storybook states and
   browser review of interaction, accessibility, themes, and layout. A screen's workshop
   fixture applies its rules over local state, so its flows can be played through.
4. Compose the page in web and desktop, and verify it against a local host: routing,
   the connected flows, and platform behavior.

UI stories use presentation fixtures. App tests exercise pages over a scripted transport.

Follow the repository's [verification commands](testing.md). Component scenarios
establish feature behavior; app and native checks establish platform integration.
