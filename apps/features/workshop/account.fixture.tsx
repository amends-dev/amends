import {
  AppearanceProvider,
  ClientProvider,
  DirectoryProvider,
  Session,
  useAppearance,
  useDirectory,
  useSession,
  type SessionStore,
} from "@amends/client";
import { Account } from "@amends/features/account";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Column } from "@amends/ui/primitives/layout";
import { Divider } from "@amends/ui/primitives/divider";
import { Text } from "@amends/ui/primitives/text";
import { Schema } from "effect";
import { createSignal, onCleanup, onMount, Show, type ParentProps } from "solid-js";
import { api, openScenario, type Scenario } from "./scenario.ts";
function Theme(props: ParentProps) {
  const appearance = useAppearance();
  return (
    <ThemeProvider theme={appearance.resolved() === "dark" ? "soot" : "cotton"}>
      <Column gap={4} style={{ padding: "2rem", "min-height": "36rem" }}>
        <Text as="h1" variant="heading">
          Your account
        </Text>
        <output aria-label="Appearance">{appearance.resolved()}</output>
        {props.children}
      </Column>
    </ThemeProvider>
  );
}
/** The account menu, inside a workspace when one is given, where the reader has a name. */
function AccountPreview(props: { readonly workspaceId?: string }) {
  const session = useSession(),
    directory = useDirectory();
  const [naming, setNaming] = createSignal(false);
  return (
    <Show when={session.session} fallback={<Text role="status">Signed out</Text>}>
      <Text role="status">
        {directory.state()._tag === "Ready" ? "Session validated" : "Checking session…"}
      </Text>
      <Account.Root>
        <Account.Trigger workspaceId={props.workspaceId} />
        <Account.Content>
          <Account.Identity workspaceId={props.workspaceId} />
          <Divider.Line />
          <Account.Appearance />
          <Divider.Line />
          <Account.Actions>
            <Account.Link href="#workspaces">Switch workspace</Account.Link>
            <Show when={props.workspaceId}>
              <Account.ChangeName onClick={() => setNaming(true)} />
            </Show>
            <Account.SignOut />
          </Account.Actions>
        </Account.Content>
      </Account.Root>
      <Show when={props.workspaceId}>
        {(workspaceId) => (
          <Account.NameDialog
            workspaceId={workspaceId()}
            open={naming()}
            onOpenChange={setNaming}
          />
        )}
      </Show>
    </Show>
  );
}
export function AccountFixture(props: { baseUrl?: string; workspace?: boolean }) {
  const [ready, setReady] = createSignal<{
    scenario: Scenario;
    session: Session;
    workspaceId?: string;
  }>();
  const [error, setError] = createSignal<string>();
  let alive = true;
  let scenario: Scenario | undefined;
  onMount(() => {
    void (async () => {
      scenario = await openScenario(props.baseUrl);
      if (!alive) {
        await scenario.dispose();
        return;
      }
      await api(scenario, "/session/email", undefined, { email: "account@example.com" });
      const code = (await scenario.snapshot()).delivered.at(-1)?.code;
      const session = Schema.decodeUnknownSync(Session)(
        await api(scenario, "/session/code", undefined, { email: "account@example.com", code }),
      );
      // Inside a workspace, the account holder named themselves when creating it.
      const workspace = props.workspace
        ? ((await api(scenario, "/workspaces", session.token, {
            name: "Mercier & Co",
            memberName: "Account Holder",
          })) as { readonly id: string })
        : undefined;
      if (alive)
        setReady({ scenario, session, ...(workspace ? { workspaceId: workspace.id } : {}) });
    })().catch((cause) => {
      if (alive) setError(String(cause));
    });
  });
  onCleanup(() => {
    alive = false;
    void scenario?.dispose().catch(console.error);
  });
  return (
    <AppearanceProvider>
      <Theme>
        <Show when={error()}>
          <Text role="alert">{error()}</Text>
        </Show>
        <Show when={ready()} fallback={<Text role="status">Starting isolated backend…</Text>}>
          {(value) => {
            let stored: Session | undefined = value().session;
            const store: SessionStore = {
              read: () => stored,
              write: (next) => {
                stored = next;
              },
              subscribe: () => () => {},
            };
            return (
              <ClientProvider apiBaseUrl={value().scenario.apiBaseUrl} sessionStore={store}>
                <DirectoryProvider>
                  <AccountPreview workspaceId={value().workspaceId} />
                </DirectoryProvider>
              </ClientProvider>
            );
          }}
        </Show>
      </Theme>
    </AppearanceProvider>
  );
}
