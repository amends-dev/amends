import { ClientProvider, DirectoryProvider, type Session, type SessionStore } from "@amends/client";
import { WorkspaceUnavailable } from "@amends/features/workspaces";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { openScenario, type Scenario } from "./scenario.ts";
import { signIn } from "./settings.fixture.tsx";
import { api } from "./workspaces.fixture.tsx";

export type Access = "removed" | "invited" | "unknown";
/**
 * Signs in a member whose access to one workspace is in the chosen state, through the real
 * host: removed by the owner, invited and not yet accepted, or never invited.
 */
export function UnavailableFixture(props: {
  baseUrl?: string;
  access?: Access;
  theme?: "cotton" | "soot";
}) {
  const [scenario, setScenario] = createSignal<Scenario>();
  const [credential, setCredential] = createSignal<Session>();
  const [workspaceId, setWorkspaceId] = createSignal("");
  const [error, setError] = createSignal<string>();
  const store: SessionStore = { read: credential, write: setCredential, subscribe: () => () => {} };
  let current: Scenario | undefined,
    alive = true;
  onMount(() => {
    void (async () => {
      current = await openScenario(props.baseUrl);
      if (!alive) {
        await current.dispose();
        return;
      }
      const owner = await signIn(current, "owner@example.test");
      const member = await signIn(current, "member@example.test");
      const workspace = await api(current, "/workspaces", owner.token, { name: "Mercier & Co" });
      const access = props.access ?? "removed";
      if (access !== "unknown") {
        const invitation = await api(
          current,
          `/workspaces/${workspace.id}/invitations`,
          owner.token,
          {
            recipientId: member.humanId,
            roleId: "builtin:member",
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        );
        if (access === "removed") {
          await api(
            current,
            `/workspaces/${workspace.id}/invitations/${invitation.details.id}/accept`,
            member.token,
            {},
          );
          const members = (await api(
            current,
            `/workspaces/${workspace.id}/members`,
            owner.token,
          )) as Array<{ id: string; identity: { id: string } }>;
          const joined = members.find((entry) => entry.identity.id === member.humanId);
          const removed = await fetch(
            `${current.apiBaseUrl}/workspaces/${workspace.id}/members/${joined?.id}`,
            { method: "DELETE", headers: { authorization: `Bearer ${owner.token}` } },
          );
          if (!removed.ok) throw new Error("Fixture removal failed");
        }
      }
      if (!alive) return;
      setWorkspaceId(workspace.id);
      setCredential(member);
      setScenario(current);
    })().catch((cause) => {
      if (alive) setError(String(cause));
    });
  });
  onCleanup(() => {
    alive = false;
    void current?.dispose().catch(console.error);
  });
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <main data-scenario-url={scenario()?.url} style={{ padding: "2rem" }}>
        <Show when={error()}>
          <Text role="alert">{error()}</Text>
        </Show>
        <Show when={scenario()} fallback={<Text role="status">Starting isolated backend…</Text>}>
          {(s) => (
            <Column style={{ "max-width": "26.25rem" }}>
              <ClientProvider apiBaseUrl={s().apiBaseUrl} sessionStore={store}>
                <DirectoryProvider>
                  <WorkspaceUnavailable.Root workspaceId={workspaceId()}>
                    <Column gap={6}>
                      <WorkspaceUnavailable.Heading />
                      <WorkspaceUnavailable.Reason />
                      <WorkspaceUnavailable.Hint />
                    </Column>
                  </WorkspaceUnavailable.Root>
                </DirectoryProvider>
              </ClientProvider>
            </Column>
          )}
        </Show>
      </main>
    </ThemeProvider>
  );
}
