# Connected features

`@amends/features` connects the independent client and UI packages. Components
own presentation mappings, while client owns operations/state and UI owns forms.
Routes, page layouts, navigation, API URL, and persistence remain caller-owned.

`@amends/features/sign-in` exports `SignIn` and `SignInProps`. Mount it inside
`ClientProvider`; optionally pass `deliveryHint` and `headingAs`. It renders the
email/code forms and maps errors, pending actions, and resend feedback. Editing
preserves the active input; changing steps focuses the next field. When a credential
exists it renders no form. The app's directory guard validates that credential and
chooses navigation. No page layout or success route is built into this component.

## Workshop

```sh
bun run --filter @amends/features dev
bun run test --project @amends/features
bun run --filter @amends/features build
```

Storybook runs at `http://127.0.0.1:6008` (HMR 6009). The launcher also starts a
loopback-only development host. PostgreSQL must be locally installed, or
`AMENDS_POSTGRES_URL` must name a server allowed to create temporary databases.
It never uses `AMENDS_DATABASE_URL` or loads environment files for the host.

Each story gets a fresh database, development authentication, and memory session.
The production component calls the real HTTP routes and gateway. **Playground**
offers captured delivery, a ten-minute clock advance, failure injection, request
gates, and unmount controls. **Refresh delivery** reveals the latest issued code.
The eight automated stories cover success, rejections, resend, failures, duplicates,
and changing email/unmounting during verification. Success also calls the directory.
Portable tests run those same stories; browser review covers the actual proxy and DOM.

Server fixtures live in `hosts/local/workshop`, browser fixtures in `workshop`,
and neither is exported to consumers. Clock changes affect only sign-in. HTTP
cancellation cannot promise server-side rollback; scenarios also check that released
obsolete work cannot establish a session. Normal unmount deletes the scenario;
stopping the launcher releases remaining databases and its temporary cluster. A
crashed tab may retain a scenario until shutdown; the host limits active scenarios
to twelve. A static Storybook build needs this backend/proxy to run live stories.

Next: introduce the sign-in page layout in UI, then mount this feature in web and desktop.
