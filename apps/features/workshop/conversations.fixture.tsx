import {
  ClientProvider,
  DirectoryProvider,
  WorkspaceFeedProvider,
  type Session,
  type SessionStore,
} from "@amends/client";
import { GroupStream, GroupsNavigation, ThreadPanel } from "@amends/features/conversations";
import { Navigation } from "@amends/ui/compositions/navigation";
import { Shell } from "@amends/ui/compositions/shell";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Button } from "@amends/ui/primitives/button";
import { Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { openScenario, type Scenario } from "./scenario.ts";
import { signIn } from "./settings.fixture.tsx";
import { api } from "./workspaces.fixture.tsx";

interface Setup {
  readonly scenario: Scenario;
  readonly owner: Session;
  readonly member: Session;
  readonly workspaceId: string;
  readonly groupId: string;
  readonly threads: ReadonlyArray<string>;
}
const hashThread = () => new URLSearchParams(window.location.hash.slice(1)).get("thread") ?? "";
/**
 * The owner of a workspace reads a group where a member started threads and the owner replied,
 * through the real host. Controls act as the member, so their messages arrive over the live feed.
 */
export function ConversationsFixture(props: {
  baseUrl?: string;
  threads?: number;
  theme?: "cotton" | "soot";
}) {
  const [setup, setSetup] = createSignal<Setup>();
  const [credential, setCredential] = createSignal<Session>();
  const [error, setError] = createSignal<string>();
  const [thread, setThread] = createSignal(hashThread());
  const store: SessionStore = { read: credential, write: setCredential, subscribe: () => () => {} };
  let current: Scenario | undefined,
    alive = true;
  onMount(() => {
    const follow = () => setThread(hashThread());
    window.addEventListener("hashchange", follow);
    onCleanup(() => window.removeEventListener("hashchange", follow));
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
        roleId: "builtin:viewer",
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
      const texts = [
        "Can you look at the supplier terms when you get a moment? I will send the contract after the close.",
        "Explain the reconcile script to me — what is it actually comparing?",
        "The September close is still open, and the receipts question from this morning is unanswered.",
      ];
      const threads: Array<string> = [];
      for (let index = 0; index < (props.threads ?? 3); index++) {
        const started = await api(scenario, `${path}/groups/${group.id}/threads`, member.token, {
          text: texts[index % texts.length],
          mentions: [],
        });
        threads.push(started.thread.id);
      }
      if (threads[1])
        for (const text of ["It compares ledger rows by invoice date.", "Rounding is separate."])
          await api(scenario, `${path}/threads/${threads[1]}/messages`, owner.token, {
            text,
            mentions: [],
          });
      if (!alive) return;
      // The client reads its credential when it mounts, so set it before rendering.
      setCredential(owner);
      setSetup({ scenario, owner, member, workspaceId: workspace.id, groupId: group.id, threads });
    })().catch((cause) => {
      if (alive) setError(String(cause));
    });
  });
  onCleanup(() => {
    alive = false;
    void current?.dispose().catch(console.error);
  });
  const asMember = (path: string, body: unknown) => {
    const value = setup();
    if (!value) return;
    void api(
      value.scenario,
      `/workspaces/${value.workspaceId}${path}`,
      value.member.token,
      body,
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
                <Shell.Root style={{ height: "100dvh" }} data-scenario-url={value().scenario.url}>
                  <Shell.Sidebar aria-label="Workspace sidebar">
                    <Shell.SidebarContent>
                      <Navigation.Root aria-label="Workspace">
                        <GroupsNavigation
                          workspaceId={value().workspaceId}
                          href={(groupId) => `#group=${groupId}`}
                          current={value().groupId}
                        />
                      </Navigation.Root>
                    </Shell.SidebarContent>
                  </Shell.Sidebar>
                  <Shell.Body>
                    <Shell.Header workspace>
                      <Row gap={2}>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            asMember(`/threads/${value().threads[1]}/messages`, {
                              text: "Thanks — that clears it up.",
                              mentions: [],
                            })
                          }
                        >
                          Reply as member
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            asMember(`/groups/${value().groupId}/threads`, {
                              text: "One more question about the receipts.",
                              mentions: [],
                            })
                          }
                        >
                          Start thread as member
                        </Button>
                      </Row>
                    </Shell.Header>
                    <Shell.Main workspace aria-label="Design">
                      <Shell.Content fill>
                        <GroupStream
                          workspaceId={value().workspaceId}
                          groupId={value().groupId}
                          label="Design"
                          threadHref={(threadId) => `#thread=${threadId}`}
                          currentThread={thread() || undefined}
                        />
                      </Shell.Content>
                    </Shell.Main>
                  </Shell.Body>
                  <Shell.Inspector
                    title="Thread"
                    open={thread() !== ""}
                    onOpenChange={(open) => {
                      if (!open) window.location.hash = "";
                    }}
                  >
                    <Show when={thread()} keyed>
                      {(threadId) => (
                        <ThreadPanel
                          workspaceId={value().workspaceId}
                          groupId={value().groupId}
                          threadId={threadId}
                          onClose={() => {
                            window.location.hash = "";
                          }}
                        />
                      )}
                    </Show>
                  </Shell.Inspector>
                </Shell.Root>
              </WorkspaceFeedProvider>
            </DirectoryProvider>
          </ClientProvider>
        )}
      </Show>
    </ThemeProvider>
  );
}
