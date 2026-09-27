import {
  ClientProvider,
  DirectoryProvider,
  Session,
  WorkspaceFeedProvider,
  type SessionStore,
  type SettingsSection,
} from "@amends/client";
import * as Settings from "@amends/features/settings";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { SegmentedControl } from "@amends/ui/compositions/segmented-control";
import { ListDetail } from "@amends/ui/compositions/list-detail";
import { PageColumns } from "@amends/ui/compositions/page-columns";
import { Column, Row, Container } from "@amends/ui/primitives/layout";
import { Button } from "@amends/ui/primitives/button";
import { Text } from "@amends/ui/primitives/text";
import { Schema } from "effect";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Recipient } from "./recipient.fixture.tsx";
import { api, openScenario, type Scenario } from "./scenario.ts";
export async function signIn(scenario: Scenario, email: string) {
  await api(scenario, "/session/email", undefined, { email });
  const code = (await scenario.snapshot()).delivered.at(-1)?.code;
  return Schema.decodeUnknownSync(Session)(
    await api(scenario, "/session/code", undefined, { email, code }),
  );
}
export function SettingsFixture(props: {
  baseUrl?: string;
  section?: SettingsSection;
  as?: "Owner" | "Administrator" | "Member";
  theme?: "cotton" | "soot";
}) {
  const [scenario, setScenario] = createSignal<Scenario>(),
    [credential, setCredential] = createSignal<Session>(),
    [workspaceId, setWorkspaceId] = createSignal(""),
    [error, setError] = createSignal<string>();
  const [section, setSection] = createSignal<SettingsSection>(props.section ?? "workspace"),
    [member, setMember] = createSignal(""),
    [picker, setPicker] = createSignal(false),
    [mounted, setMounted] = createSignal(true);
  const listeners = new Set<() => void>();
  const store: SessionStore = {
    read: credential,
    write: setCredential,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const replaceCredential = (value: Session | undefined) => {
    setCredential(value);
    listeners.forEach((listener) => listener());
  };
  let current: Scenario | undefined,
    alive = true;
  const credentials = new Map<string, Session>();
  const [external, setExternal] = createSignal("");
  const inviteElsewhere = async () => {
    const scenario = current,
      owner = credentials.get("Owner");
    if (!scenario || !owner) return;
    const roles = (await api(
      scenario,
      `/workspaces/${workspaceId()}/roles`,
      owner.token,
    )) as Array<{
      role: { id: string; name: string };
    }>;
    await api(scenario, `/workspaces/${workspaceId()}/invitations`, owner.token, {
      recipientId: "elsewhere@example.test",
      roleId: roles.find((choice) => choice.role.name === "Member")?.role.id,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    setExternal("External invitation complete");
  };
  const renameElsewhere = async () => {
    const scenario = current,
      owner = credentials.get("Owner");
    if (!scenario || !owner) return;
    const data = await api(scenario, `/workspaces/${workspaceId()}/settings`, owner.token);
    const result = await fetch(`${scenario.apiBaseUrl}/workspaces/${workspaceId()}/name`, {
      method: "PUT",
      headers: { authorization: `Bearer ${owner.token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Changed elsewhere", expectedName: data.workspace.name }),
    });
    if (!result.ok) throw new Error("External rename failed");
    setExternal("External rename complete");
  };
  onMount(() => {
    void (async () => {
      current = await openScenario(props.baseUrl);
      if (!alive) {
        await current.dispose();
        return;
      }
      for (const [role, email] of [
        ["Owner", "owner@example.test"],
        ["Administrator", "admin@example.test"],
        ["Member", "member@example.test"],
        ["Recipient", "new@example.test"],
      ] as const)
        credentials.set(role, await signIn(current, email));
      const owner = credentials.get("Owner")!;
      const workspace = await api(current, "/workspaces", owner.token, { name: "Mercier & Co" });
      const roles = (await api(
        current,
        `/workspaces/${workspace.id}/roles`,
        owner.token,
      )) as Array<{ role: { id: string; name: string } }>;
      for (const role of ["Administrator", "Member"]) {
        const signed = credentials.get(role)!;
        const invitation = await api(
          current,
          `/workspaces/${workspace.id}/invitations`,
          owner.token,
          {
            recipientId: signed.humanId,
            roleId: roles.find((choice) => choice.role.name === role)?.role.id,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        );
        await api(
          current,
          `/workspaces/${workspace.id}/invitations/${invitation.details.id}/accept`,
          signed.token,
          {},
        );
      }
      if (!alive) return;
      setWorkspaceId(workspace.id);
      setCredential(credentials.get(props.as ?? "Owner"));
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
      <main data-scenario-url={scenario()?.url} data-workspace-id={workspaceId()}>
        <Container>
          <Column gap={6}>
            <Show when={error()}>
              <Text role="alert">{error()}</Text>
            </Show>
            <Show
              when={scenario()}
              fallback={<Text role="status">Starting isolated backend…</Text>}
            >
              {(s) => (
                <>
                  <Row as="aside" aria-label="Workshop controls">
                    <For each={["Owner", "Administrator", "Member", "Recipient"]}>
                      {(role) => (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            replaceCredential(credentials.get(role));
                            setPicker(role === "Recipient");
                            setMember("");
                          }}
                        >
                          Act as {role}
                        </Button>
                      )}
                    </For>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        void s().command("fail-directory");
                      }}
                    >
                      Fail next directory read
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        void renameElsewhere().catch((cause) => setError(String(cause)));
                      }}
                    >
                      Rename elsewhere
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        void inviteElsewhere().catch((cause) => setError(String(cause)));
                      }}
                    >
                      Invite elsewhere
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        void s().command("drop-changes");
                      }}
                    >
                      Drop live connection
                    </Button>
                    <output aria-label="External change">{external()}</output>
                    <Button variant="ghost" onClick={() => setMounted(!mounted())}>
                      {mounted() ? "Unmount feature" : "Mount feature"}
                    </Button>
                  </Row>
                  <ClientProvider apiBaseUrl={s().apiBaseUrl} sessionStore={store}>
                    <DirectoryProvider>
                      <Show when={mounted()}>
                        <Show
                          when={picker()}
                          fallback={
                            <WorkspaceFeedProvider workspaceId={workspaceId()}>
                              <SegmentedControl.Root
                                aria-label="Settings sections"
                                value={section()}
                                onValueChange={(name) => {
                                  if (
                                    name !== "workspace" &&
                                    name !== "members" &&
                                    name !== "invites"
                                  )
                                    return;
                                  setSection(name);
                                  setMember("");
                                }}
                              >
                                <SegmentedControl.Item value="members">
                                  People
                                </SegmentedControl.Item>
                                <SegmentedControl.Item value="invites">
                                  Invites
                                </SegmentedControl.Item>
                                <SegmentedControl.Item value="workspace">
                                  Workspace
                                </SegmentedControl.Item>
                              </SegmentedControl.Root>
                              <Settings.Root workspaceId={workspaceId()} section={section()}>
                                <Column gap={6}>
                                  <Show when={section() === "workspace"}>
                                    <PageColumns.Root>
                                      <PageColumns.Primary>
                                        <Column gap={6}>
                                          <Settings.WorkspaceName />
                                          <Settings.OwnershipTransfer />
                                        </Column>
                                      </PageColumns.Primary>
                                      <PageColumns.Aside aria-label="Workspace details">
                                        <Settings.WorkspaceDetails />
                                      </PageColumns.Aside>
                                    </PageColumns.Root>
                                  </Show>
                                  <Show when={section() === "members"}>
                                    <div
                                      onClick={(event) => {
                                        const href = (event.target as Element)
                                          .closest("a")
                                          ?.getAttribute("href");
                                        if (href?.startsWith("#member:")) {
                                          event.preventDefault();
                                          setMember(href.slice(8));
                                        } else if (href === "#members") {
                                          event.preventDefault();
                                          setMember("");
                                        }
                                      }}
                                    >
                                      <ListDetail.Root selected={!!member()}>
                                        <ListDetail.List>
                                          <Settings.MemberList
                                            memberHref={(id) => `#member:${id}`}
                                            selectedId={member()}
                                          />
                                        </ListDetail.List>
                                        <Show when={member()}>
                                          <ListDetail.Detail aria-label="Member details">
                                            <Settings.MemberDetail
                                              memberId={member()}
                                              backHref="#members"
                                            />
                                          </ListDetail.Detail>
                                        </Show>
                                      </ListDetail.Root>
                                    </div>
                                  </Show>
                                  <Show when={section() === "invites"}>
                                    <PageColumns.Root>
                                      <PageColumns.Primary>
                                        <Settings.InvitationHistory />
                                      </PageColumns.Primary>
                                      <PageColumns.Aside aria-label="New invitation">
                                        <Settings.InviteForm />
                                      </PageColumns.Aside>
                                    </PageColumns.Root>
                                  </Show>
                                  <Settings.Feedback />
                                </Column>
                              </Settings.Root>
                            </WorkspaceFeedProvider>
                          }
                        >
                          <Recipient workspaceHref={(id) => `#workspace:${id}`} />
                        </Show>
                      </Show>
                    </DirectoryProvider>
                  </ClientProvider>
                </>
              )}
            </Show>
          </Column>
        </Container>
      </main>
    </ThemeProvider>
  );
}
