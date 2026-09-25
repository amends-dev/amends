# Feature development

Agreed direction; the connected features package and its workshop are planned.
Build each feature through the stack and verify it independently before adding it
to an application page. [Sign-in](sign-in-design.md) is the first slice.

## Ownership

| Location                   | Owns                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Backend and HTTP packages  | Business rules, host capabilities, contracts, and handlers.                         |
| `apps/client`              | Headless operations, validation, request state, and session lifetime.               |
| `apps/ui`                  | Presentation components and page layouts, taking props and callbacks.               |
| `apps/features` (planned)  | Reusable wiring between client and UI; connected feature stories.                   |
| `apps/web`, `apps/desktop` | Route trees, page composition, navigation, configuration, and platform integration. |

Client and UI remain independent. Features consume both without owning routes or
platform APIs. This extends today's app-owned wiring with a shared composition
layer. Stories and server fixtures stay outside production exports; adding the
workspace must also extend boundary checks, test discovery, and CI builds.

## Build and verify

1. Establish backend behavior and its HTTP contract; reuse what already exists.
2. Add headless client operations and tests for their state and lifetime.
3. Introduce needed UI pieces one at a time, with isolated Storybook states and
   browser review of interaction, accessibility, themes, and layout.
4. Connect client and UI in `features`. Exercise that production component in its
   own Storybook through the real HTTP server and backend before placing it on a page.
5. Mount it in web and desktop, verifying routing and platform behavior.

UI stories use presentation fixtures. Connected scenarios use isolated sessions
and temporary backend data, capture external delivery, and clean up their resources.
Controlled clocks and request gates make expiry and races reproducible. Host-side
scenario setup lives in development/test tooling, outside browser code.

Follow the repository's [verification commands](testing.md). Component scenarios
establish feature behavior; app and native checks establish platform integration.
