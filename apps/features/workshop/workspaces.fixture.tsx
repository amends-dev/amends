import { ClientProvider, DirectoryProvider, Session, type SessionStore } from "@amends/client";
import { CreateWorkspace, WorkspacePicker } from "@amends/features/workspaces";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Button } from "@amends/ui/primitives/button";
import { Text } from "@amends/ui/primitives/text";
import { Schema } from "effect";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { openScenario, type Scenario, type Command } from "./scenario.ts";

export async function api(scenario: Scenario, path: string, token?: string, body?: unknown) {
  const response = await fetch(`${scenario.apiBaseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Fixture request failed: ${path} (${response.status})`);
  return response.status === 202 ? undefined : response.json();
}
export function WorkspacesFixture(props: {
  baseUrl?: string;
  populated?: boolean;
  theme?: "cotton" | "soot";
}) {
  const [scenario, setScenario] = createSignal<Scenario>();
  const [credential, setCredential] = createSignal<Session>();
  const [error, setError] = createSignal<string>();
  const [creating, setCreating] = createSignal(false);
  const [mounted, setMounted] = createSignal(true);
  const [opened, setOpened] = createSignal("");
  const store: SessionStore = { read: credential, write: setCredential, subscribe: () => () => {} };
  let current: Scenario | undefined;
  let alive = true;
  onMount(() => {
    void (async () => {
      current = await openScenario(props.baseUrl);
      if (!alive) {
        await current.dispose();
        return;
      }
      await api(current, "/session/email", undefined, { email: "workspace@example.com" });
      const code = (await current.snapshot()).delivered.at(-1)?.code;
      const signedIn = Schema.decodeUnknownSync(Session)(
        await api(current, "/session/code", undefined, { email: "workspace@example.com", code }),
      );
      if (props.populated) {
        await api(current, "/workspaces", signedIn.token, { name: "Home" });
        await api(current, "/workspaces", signedIn.token, { name: "Mercier & Co" });
      }
      if (!alive) return;
      setCredential(signedIn);
      setScenario(current);
    })().catch((cause) => {
      if (alive) setError(String(cause));
    });
  });
  onCleanup(() => {
    alive = false;
    void current?.dispose().catch(console.error);
  });
  const command = (value: Command) => {
    void current?.command(value).catch((cause) => setError(String(cause)));
  };
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <main data-scenario-url={scenario()?.url} style={{ padding: "2rem" }}>
        <Show when={error()}>
          <Text role="alert">{error()}</Text>
        </Show>
        <Show when={scenario()} fallback={<Text role="status">Starting isolated backend…</Text>}>
          {(s) => (
            <Column gap={6} style={{ "max-width": "35rem" }}>
              <ClientProvider apiBaseUrl={s().apiBaseUrl} sessionStore={store}>
                <DirectoryProvider>
                  <Show when={mounted()}>
                    <Show
                      when={creating()}
                      fallback={
                        <WorkspacePicker.Root>
                          <Column gap={4}>
                            <Text as="h1" variant="heading">
                              Where are you working?
                            </Text>
                            <WorkspacePicker.Summary />
                            <WorkspacePicker.List workspaceHref={(id) => `#workspace-${id}`} />
                            <WorkspacePicker.Invitations />
                            <WorkspacePicker.Empty />
                            <WorkspacePicker.Status />
                            <Button onClick={() => setCreating(true)}>New workspace</Button>
                          </Column>
                        </WorkspacePicker.Root>
                      }
                    >
                      <CreateWorkspace.Root
                        onCreated={(id) => {
                          setOpened(id);
                          setCreating(false);
                        }}
                      >
                        <CreateWorkspace.Form />
                        <CreateWorkspace.Result />
                      </CreateWorkspace.Root>
                    </Show>
                  </Show>
                </DirectoryProvider>
              </ClientProvider>
              <output aria-label="Opened workspace">{opened()}</output>
              <Row as="aside" aria-label="Workshop controls">
                <Button variant="secondary" onClick={() => command("lose-creation-response")}>
                  Lose next creation response
                </Button>
                <Button variant="secondary" onClick={() => command("fail-directory")}>
                  Fail next directory read
                </Button>
                <Button variant="secondary" onClick={() => command("hold")}>
                  Hold next request
                </Button>
                <Button variant="secondary" onClick={() => command("release")}>
                  Release request
                </Button>
                <Button variant="secondary" onClick={() => setMounted(!mounted())}>
                  {mounted() ? "Unmount feature" : "Mount feature"}
                </Button>
              </Row>
            </Column>
          )}
        </Show>
      </main>
    </ThemeProvider>
  );
}
