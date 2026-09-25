import {
  ClientProvider,
  DirectoryProvider,
  useDirectory,
  useSession,
  type SessionStore,
} from "@amends/client";
import { SignIn } from "@amends/features/sign-in";
import { Button } from "@amends/ui/primitives/button";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { colorThemes } from "@amends/ui/foundations/color/styles";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { openScenario, type Scenario, type Snapshot, type Command } from "./scenario.ts";

function SessionResult() {
  const session = useSession();
  const directory = useDirectory();
  return (
    <Show when={session.session}>
      <Column gap={4}>
        <Text as="h1" variant="heading">
          Session established
        </Text>
        <Text as="p" role="status">
          {directory.state()._tag === "Ready"
            ? "Credential accepted by the directory."
            : directory.state()._tag === "Failed"
              ? "Directory request failed."
              : "Checking the directory…"}
        </Text>
        <Button variant="secondary" onClick={() => session.replace(undefined)}>
          Sign out
        </Button>
      </Column>
    </Show>
  );
}

export function SignInFixture(props: { baseUrl?: string; theme?: "cotton" | "soot" }) {
  const [scenario, setScenario] = createSignal<Scenario>();
  const [snapshot, setSnapshot] = createSignal<Snapshot>();
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [mounted, setMounted] = createSignal(true);
  const store: SessionStore = { read: () => undefined, write: () => {}, subscribe: () => () => {} };
  let alive = true;
  onMount(() => {
    void openScenario(props.baseUrl)
      .then(async (value) => {
        if (!alive) {
          await value.dispose();
          return;
        }
        setScenario(value);
        setSnapshot(await value.snapshot());
      })
      .catch((cause: unknown) => {
        if (alive) setError(String(cause));
      });
  });
  onCleanup(() => {
    alive = false;
    void scenario()
      ?.dispose()
      .catch((cause: unknown) => console.error(cause));
  });
  const control = (command?: Command) => {
    const current = scenario();
    if (!current || busy()) return;
    setBusy(true);
    void (command ? current.command(command) : current.snapshot())
      .then(setSnapshot)
      .catch((cause: unknown) => setError(String(cause)))
      .finally(() => setBusy(false));
  };
  return (
    <main
      class={colorThemes[props.theme ?? "cotton"]}
      data-scenario-url={scenario()?.url}
      style={{ padding: "2rem", "min-height": "90vh" }}
    >
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Show when={scenario()} fallback={<p role="status">Starting isolated backend…</p>}>
        {(current) => (
          <Column gap={6} style={{ "max-width": "38rem" }}>
            <div style={{ "max-width": "26.25rem", width: "100%" }}>
              <ClientProvider apiBaseUrl={current().apiBaseUrl} sessionStore={store}>
                <DirectoryProvider>
                  <Show when={mounted()}>
                    <SignIn.Root>
                      <SignIn.EmailForm />
                      <SignIn.CodeForm deliveryHint="In this workshop, refresh delivery below to find your code." />
                    </SignIn.Root>
                  </Show>
                  <SessionResult />
                </DirectoryProvider>
              </ClientProvider>
            </div>
            <Column as="aside" aria-label="Workshop controls" gap={4}>
              <Text as="h2" variant="mono">
                Workshop controls
              </Text>
              <Text as="p">
                Real HTTP and PostgreSQL. Codes are captured here; no email is sent.
              </Text>
              <Row>
                <Button variant="secondary" disabled={busy()} onClick={() => control()}>
                  Refresh delivery
                </Button>
                <Button variant="secondary" disabled={busy()} onClick={() => control("expire")}>
                  Advance ten minutes
                </Button>
                <Button variant="secondary" disabled={busy()} onClick={() => control("fail")}>
                  Fail next request
                </Button>
                <Button variant="secondary" disabled={busy()} onClick={() => control("hold")}>
                  Hold next request
                </Button>
                <Button variant="secondary" disabled={busy()} onClick={() => control("release")}>
                  Release request
                </Button>
                <Button variant="secondary" onClick={() => setMounted(!mounted())}>
                  {mounted() ? "Unmount feature" : "Mount feature"}
                </Button>
              </Row>
              <output aria-label="Captured code">
                {snapshot()?.delivered.at(-1)?.code ?? "No code yet"}
              </output>
              <Text as="p">
                Last refresh: {snapshot()?.requests ?? 0} requests. Paused:{" "}
                {snapshot()?.held ? "yes" : "no"}.
              </Text>
            </Column>
          </Column>
        )}
      </Show>
    </main>
  );
}
