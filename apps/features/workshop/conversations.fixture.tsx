import {
  ClientProvider,
  DirectoryProvider,
  WorkspaceFeedProvider,
  type Session,
  type SessionStore,
} from "@amends/client";
import {
  DirectDraft,
  GroupFollowAction,
  GroupFollowNote,
  GroupMembersAction,
  GroupName,
  GroupRenameAction,
  GroupStream,
  GroupsNavigation,
  Inbox,
  PublicGroups,
  ThreadPanel,
} from "@amends/features/conversations";
import { Navigation } from "@amends/ui/compositions/navigation";
import { Shell } from "@amends/ui/compositions/shell";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Button } from "@amends/ui/primitives/button";
import { Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createSignal, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { api, openScenario, type Scenario } from "./scenario.ts";
import { signIn } from "./settings.fixture.tsx";

interface Setup {
  readonly scenario: Scenario;
  readonly owner: Session;
  readonly member: Session;
  readonly workspaceId: string;
  readonly ownerMemberId: string;
  readonly memberId: string;
  readonly groupId: string;
  readonly threads: ReadonlyArray<string>;
}
const hashThread = () => new URLSearchParams(window.location.hash.slice(1)).get("thread") ?? "";
const hashGroup = () => new URLSearchParams(window.location.hash.slice(1)).get("group") ?? "";
const hashDirect = () => new URLSearchParams(window.location.hash.slice(1)).get("direct") ?? "";
const hashAt = () =>
  Number(new URLSearchParams(window.location.hash.slice(1)).get("at")) || undefined;
/**
 * The owner of a workspace reads a group where a member started threads and the owner replied,
 * through the real host, or their inbox, where the member has since replied to them and mentioned
 * them. Controls act as the member, so their messages arrive over the live feed.
 */
export function ConversationsFixture(props: {
  baseUrl?: string;
  threads?: number;
  theme?: "cotton" | "soot";
  view?: "group" | "inbox" | "members" | "browse";
}) {
  const [setup, setSetup] = createSignal<Setup>();
  const [credential, setCredential] = createSignal<Session>();
  const [error, setError] = createSignal<string>();
  const [thread, setThread] = createSignal(hashThread());
  const [shownGroup, setShownGroup] = createSignal(hashGroup());
  const [drafting, setDrafting] = createSignal(hashDirect());
  const [at, setAt] = createSignal(hashAt());
  const store: SessionStore = { read: credential, write: setCredential, subscribe: () => () => {} };
  let current: Scenario | undefined,
    alive = true;
  onMount(() => {
    const follow = () => {
      setThread(hashThread());
      setShownGroup(hashGroup());
      setDrafting(hashDirect());
      setAt(hashAt());
    };
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
        roleId: "builtin:member",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const joined = await api(
        scenario,
        `${path}/invitations/${invitation.details.id}/accept`,
        member.token,
        {},
      );
      if (props.view === "members") {
        // Someone in the workspace but not yet in the group, to add.
        const third = await signIn(scenario, "third@example.test");
        const invited = await api(scenario, `${path}/invitations`, owner.token, {
          recipientId: third.humanId,
          roleId: "builtin:member",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        });
        await api(scenario, `${path}/invitations/${invited.details.id}/accept`, third.token, {});
      }
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
      if (props.view === "browse")
        // Public groups the owner does not belong to yet, one with the member in it.
        for (const [name, memberIds] of [
          ["Lobby", [joined.id]],
          ["Announcements", []],
        ] as const)
          await api(scenario, `${path}/groups`, owner.token, {
            name,
            memberIds,
            visibility: "Public",
          });
      if (props.view === "inbox" && threads[1]) {
        // The owner takes part in the thread they replied to, so the member's reply reaches them.
        await api(scenario, `${path}/threads/${threads[1]}/messages`, member.token, {
          text: "Does that include the refunds?",
          mentions: [],
        });
        await api(scenario, `${path}/groups/${group.id}/threads`, member.token, {
          text: "@owner@example.test can you approve the September close?",
          mentions: [workspace.ownerMemberId],
        });
      }
      if (!alive) return;
      // The client reads its credential when it mounts, so set it before rendering.
      setCredential(owner);
      setSetup({
        scenario,
        owner,
        member,
        workspaceId: workspace.id,
        ownerMemberId: workspace.ownerMemberId,
        memberId: joined.id,
        groupId: group.id,
        threads,
      });
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
  /** Someone leaves the group from their own session, so this one hears of it live. */
  const leave = (who: "owner" | "member") => {
    const value = setup();
    if (!value) return;
    const path = `/workspaces/${value.workspaceId}/groups/${value.groupId}/members`;
    const session = value[who],
      memberId = who === "owner" ? value.ownerMemberId : value.memberId;
    void (async () => {
      const roster = (await api(value.scenario, `${path}?limit=100`, session.token)) as Array<{
        readonly id: string;
        readonly memberId: string;
      }>;
      const own = roster.find((admission) => admission.memberId === memberId);
      if (own) await api(value.scenario, `${path}/${own.id}/leave`, session.token, {});
    })().catch((cause) => setError(String(cause)));
  };
  /**
   * The owner renames the group from another session a moment later, as someone else might
   * while a rename is open here.
   */
  const renameSoon = () => {
    const value = setup();
    if (!value) return;
    setTimeout(() => {
      void api(
        value.scenario,
        `/workspaces/${value.workspaceId}/groups/${value.groupId}/rename`,
        value.owner.token,
        { name: "Plans", expectedName: "Design" },
      ).catch((cause) => setError(String(cause)));
    }, 1000);
  };
  /**
   * The member, still in the group, adds the owner back from their own session: no one outside a
   * private group, the owner included, can get into it themselves.
   */
  const addOwnerBack = () => {
    const value = setup();
    if (!value) return;
    void api(
      value.scenario,
      `/workspaces/${value.workspaceId}/groups/${value.groupId}/members`,
      value.member.token,
      { memberId: value.ownerMemberId },
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
                          current={shownGroup() || value().groupId}
                          browseHref="#browse"
                          browsing={props.view === "browse" && !shownGroup()}
                          onCreated={(groupId) => {
                            window.location.hash = `group=${groupId}`;
                          }}
                          onMessage={(target) => {
                            window.location.hash =
                              "groupId" in target
                                ? `group=${target.groupId}`
                                : `direct=${target.memberIds.join(",")}`;
                          }}
                        />
                      </Navigation.Root>
                    </Shell.SidebarContent>
                  </Shell.Sidebar>
                  <Shell.Body>
                    <Shell.Header workspace>
                      <Row gap={2}>
                        <Text variant="mono" data-testid="group-name">
                          <GroupName workspaceId={value().workspaceId} groupId={value().groupId} />
                        </Text>
                        <GroupRenameAction
                          workspaceId={value().workspaceId}
                          groupId={value().groupId}
                        />
                        <GroupMembersAction
                          workspaceId={value().workspaceId}
                          groupId={value().groupId}
                          onLeft={() => {
                            window.location.hash = "left";
                          }}
                        />
                        <GroupFollowAction
                          workspaceId={value().workspaceId}
                          groupId={value().groupId}
                        />
                        <Text variant="mono" tone="secondary">
                          <GroupFollowNote
                            workspaceId={value().workspaceId}
                            groupId={value().groupId}
                          />
                        </Text>
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
                          onClick={() => asMember(`/threads/${value().threads[1]}/typing`, {})}
                        >
                          Type as member
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
                        <Button
                          variant="secondary"
                          onClick={() =>
                            asMember(`/groups/${value().groupId}/threads`, {
                              text: "@owner@example.test the receipts are in.",
                              mentions: [value().ownerMemberId],
                            })
                          }
                        >
                          Mention owner as member
                        </Button>
                        <Button variant="secondary" onClick={() => leave("owner")}>
                          Leave elsewhere as owner
                        </Button>
                        <Button variant="secondary" onClick={() => leave("member")}>
                          Leave as member
                        </Button>
                        <Button variant="secondary" onClick={renameSoon}>
                          Rename elsewhere soon as owner
                        </Button>
                        <Button variant="secondary" onClick={addOwnerBack}>
                          Add owner back as member
                        </Button>
                      </Row>
                    </Shell.Header>
                    <Switch
                      fallback={
                        <Shell.Main workspace aria-label="Design">
                          <Shell.Content fill>
                            <Show
                              when={drafting()}
                              keyed
                              fallback={
                                <Show when={shownGroup() || value().groupId} keyed>
                                  {(groupId) => (
                                    <GroupStream
                                      workspaceId={value().workspaceId}
                                      groupId={groupId}
                                      label={groupId === value().groupId ? "Design" : "Group"}
                                      threadHref={(threadId) => `#thread=${threadId}`}
                                      currentThread={thread() || undefined}
                                    />
                                  )}
                                </Show>
                              }
                            >
                              {(to) => (
                                <DirectDraft
                                  workspaceId={value().workspaceId}
                                  memberIds={to.split(",")}
                                  onGroup={(groupId) => {
                                    window.location.hash = `group=${groupId}`;
                                  }}
                                />
                              )}
                            </Show>
                          </Shell.Content>
                        </Shell.Main>
                      }
                    >
                      <Match when={props.view === "inbox"}>
                        <Shell.Main workspace aria-label="Inbox">
                          <Shell.Content>
                            <Inbox
                              workspaceId={value().workspaceId}
                              threadHref={(_, threadId, sequence) =>
                                `#thread=${threadId}&at=${sequence}`
                              }
                              currentThread={thread() || undefined}
                            />
                          </Shell.Content>
                        </Shell.Main>
                      </Match>
                      <Match when={props.view === "browse" && !shownGroup()}>
                        <Shell.Main workspace aria-label="Browse groups">
                          <Shell.Content>
                            <PublicGroups
                              workspaceId={value().workspaceId}
                              href={(groupId) => `#group=${groupId}`}
                              onJoined={(groupId) => {
                                window.location.hash = `group=${groupId}`;
                              }}
                            />
                          </Shell.Content>
                        </Shell.Main>
                      </Match>
                    </Switch>
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
                          focus={at()}
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
