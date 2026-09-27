import {
  ClientProvider,
  DirectoryProvider,
  WorkspaceFeedProvider,
  type Session,
  type SessionStore,
} from "@amends/client";
import { Inbox } from "@amends/features/conversations";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Button } from "@amends/ui/primitives/button";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { api, openScenario, type Scenario } from "./scenario.ts";
import { signIn } from "./settings.fixture.tsx";

interface Setup {
  readonly scenario: Scenario;
  readonly member: Session;
  readonly workspaceId: string;
  readonly ownerMemberId: string;
  readonly groupId: string;
}

/**
 * The owner of a workspace reads their inbox through the real host: a member replied in a thread
 * the owner took part in, and mentioned them. A control acts as the member, so a new mention
 * arrives over the live feed.
 */
export function InboxFixture(props: { baseUrl?: string; theme?: "cotton" | "soot" }) {
  const [setup, setSetup] = createSignal<Setup>();
  const [credential, setCredential] = createSignal<Session>();
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
      const scenario = current;
      const owner = await signIn(scenario, "owner@example.test");
      const member = await signIn(scenario, "member@example.test");
      const workspace = await api(scenario, "/workspaces", owner.token, { name: "Mercier & Co" });
      const path = `/workspaces/${workspace.id}`;
      const invitation = await api(scenario, `${path}/invitations`, owner.token, {
        recipientId: member.humanId,
        roleId: "builtin:member",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const joined = await api(
        scenario,
        `${path}/invitations/${invitation.details.id}/accept`,
        member.token,
        {},
      );
      const group = await api(scenario, `${path}/groups`, owner.token, {
        name: "Design",
        memberIds: [workspace.ownerMemberId, joined.id],
      });
      const started = await api(scenario, `${path}/groups/${group.id}/threads`, member.token, {
        text: "Explain the reconcile script to me — what is it actually comparing?",
        mentions: [],
      });
      // The owner takes part in the thread they replied to, so the member's reply reaches them.
      await api(scenario, `${path}/threads/${started.thread.id}/messages`, owner.token, {
        text: "It compares ledger rows by invoice date.",
        mentions: [],
      });
      await api(scenario, `${path}/threads/${started.thread.id}/messages`, member.token, {
        text: "Does that include the refunds?",
        mentions: [],
      });
      await api(scenario, `${path}/groups/${group.id}/threads`, member.token, {
        text: "@owner@example.test can you approve the September close?",
        mentions: [workspace.ownerMemberId],
      });
      if (!alive) return;
      // The client reads its credential when it mounts, so set it before rendering.
      setCredential(owner);
      setSetup({
        scenario,
        member,
        workspaceId: workspace.id,
        ownerMemberId: workspace.ownerMemberId,
        groupId: group.id,
      });
    })().catch((cause) => {
      if (alive) setError(String(cause));
    });
  });
  onCleanup(() => {
    alive = false;
    void current?.dispose().catch(console.error);
  });
  const mention = () => {
    const value = setup();
    if (!value) return;
    void api(
      value.scenario,
      `/workspaces/${value.workspaceId}/groups/${value.groupId}/threads`,
      value.member.token,
      { text: "@owner@example.test the receipts are in.", mentions: [value.ownerMemberId] },
    ).catch((cause) => setError(String(cause)));
  };
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <Show when={error()}>
        <Text role="alert">{error()}</Text>
      </Show>
      <Show when={setup()} fallback={<Text role="status">Starting isolated backend…</Text>}>
        {(value) => (
          <ClientProvider apiBaseUrl={value().scenario.apiBaseUrl} sessionStore={store}>
            <DirectoryProvider>
              <WorkspaceFeedProvider workspaceId={value().workspaceId}>
                <Column gap={4} data-scenario-url={value().scenario.url}>
                  <Row>
                    <Button variant="secondary" onClick={mention}>
                      Mention owner as member
                    </Button>
                  </Row>
                  <Inbox
                    workspaceId={value().workspaceId}
                    threadHref={(_, threadId, sequence) => `#thread=${threadId}&at=${sequence}`}
                  />
                </Column>
              </WorkspaceFeedProvider>
            </DirectoryProvider>
          </ClientProvider>
        )}
      </Show>
    </ThemeProvider>
  );
}
