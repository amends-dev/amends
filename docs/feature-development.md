# Feature development

Build each feature through the stack and verify it independently before adding it
to an application page. [Sign-in](sign-in-design.md) is the first slice.

## Ownership

| Location                   | Owns                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Backend and HTTP packages  | Business rules, host capabilities, contracts, and handlers.                         |
| `apps/client`              | Headless operations, validation, request state, and session lifetime.               |
| `apps/ui`                  | Reusable visual components and layouts, taking data and callbacks.                  |
| `apps/features`            | Reusable wiring between client and UI; connected feature stories.                   |
| `apps/web`, `apps/desktop` | Route trees, page composition, navigation, configuration, and platform integration. |

Client and UI remain independent. Features consume both without owning routes or
platform APIs. Its [workshop](../apps/features/README.md) exercises shared composition. Stories and
server fixtures stay outside production exports; boundary checks, tests, and CI
include the features workspace.

Compose through nested children and named parts, such as `SignIn.Root` containing
`SignIn.EmailForm` and `SignIn.CodeForm`. Props carry data and callbacks, rather
than complete components. Application pages live in web and desktop.

Apps contain no styling. First inspect shared UI (including Shell), identify any
missing capability, and decide whether it is a valid reusable addition to the
design system. Verify that piece in UI before composing it into an app page.

## Build and verify

1. Establish backend behavior and its HTTP contract; reuse what already exists.
2. Add headless client operations and tests for their state and lifetime.
3. Introduce needed UI pieces one at a time, with isolated Storybook states and
   browser review of interaction, accessibility, themes, and layout.
4. Connect client and UI in `features`. Exercise that production component in its
   own Storybook through the real HTTP server and backend before placing it on a page.
5. Compose the page in web and desktop, verifying routing and platform behavior.

UI stories use presentation fixtures. Connected scenarios use isolated sessions
and temporary backend data, capture external delivery, and clean up their resources.
Controlled clocks and request gates make expiry and races reproducible. Host-side
scenario setup lives in development/test tooling, outside browser code.

Follow the repository's [verification commands](testing.md). Component scenarios
establish feature behavior; app and native checks establish platform integration.
