# Connected features

`@amends/features` connects the independent client and UI packages. Components
own presentation mappings, while client owns operations/state and UI owns forms.
Routes, page layouts, navigation, API URL, and persistence remain caller-owned.

`@amends/features/sign-in` exports the `SignIn` parts. Mount one `SignIn.Root`
inside `ClientProvider`, with `SignIn.EmailForm` and `SignIn.CodeForm` as children.
Root owns one controller and the parts render their active step. They map errors,
pending actions, and resend feedback. `headingAs` belongs on either form;
`deliveryHint` belongs on CodeForm. Editing
preserves the active input; changing steps focuses the next field. When a credential
exists the parts render no form. The app's directory guard validates that credential and
chooses navigation. No page layout or success route is built into this component.

```tsx
<SignIn.Root>
  <SignIn.EmailForm />
  <SignIn.CodeForm deliveryHint="Find your code in the host's terminal." />
</SignIn.Root>
```

Compose each form once inside the same Root, optionally within ordinary layout
children. Root creates no DOM wrapper. Unmount Root to dispose the flow.

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

Web and desktop compose their own sign-in pages from these parts and UI primitives.
Page layout and navigation remain in those apps.

## Workspace entry

`@amends/features/workspaces` exports `WorkspacePicker` and `CreateWorkspace`.
Mount them inside the existing ClientProvider and DirectoryProvider.

```tsx
<WorkspacePicker.Root>
  <WorkspacePicker.Summary />
  <WorkspacePicker.List workspaceHref={workspaceHref} />
  <WorkspacePicker.Empty />
  <WorkspacePicker.Status />
</WorkspacePicker.Root>

<CreateWorkspace.Root onCreated={openWorkspace}>
  <CreateWorkspace.Form />
  <CreateWorkspace.Result />
</CreateWorkspace.Root>
```

The app supplies URLs and navigation callbacks, headings, creation entry, account
actions, and Shell layout. The picker shows only active memberships; a pending
invitation count does not imply invitation actions are implemented.

Workspace stories cover populated/empty directories, creation, lost-response retry,
directory refresh failure, duplicate submissions, and unmounting. Controls also
apply to creation/directory requests; losing a creation response lets the real
commit finish before withholding its response. Fixtures create temporary data through
HTTP and sign in through the normal development flow. See
[workspace entry](../../docs/workspace-entry.md) for the ownership and recovery contract.
