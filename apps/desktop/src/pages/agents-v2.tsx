import { paths, useAgentsV2, useWorkspace } from "@amends/client";
import {
  AddAgentV2,
  AgentV2List,
  AgentV2Pane,
  AgentsV2Pane,
  ConfirmRemoveAgentV2,
  agentsV2Toast,
  type AgentsV2Action,
  type AgentsV2Tab,
} from "@amends/ui/screens/agents-v2";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { Show, createEffect, createMemo, createSignal, on } from "solid-js";
import { useWorkspaceActions } from "../workspace-actions.ts";

const href = (path: string) => `#${path}`;

export function AgentsV2Page() {
  const params = useParams<{ workspaceId: string }>();
  return (
    <Show when={params.workspaceId} keyed>
      {(workspaceId) => <AgentsV2 workspaceId={workspaceId} />}
    </Show>
  );
}

/**
 * A workspace's agents v2: the list, all of them or those needing setup by `?tab=`, or one agent's
 * page by its path. `?add=agent` opens Add agent over either; creating opens the agent's page.
 */
function AgentsV2(props: { readonly workspaceId: string }) {
  const { workspaceId } = props;
  const params = useParams<{ agentId?: string }>();
  const [search, setSearch] = useSearchParams<{ tab?: string; add?: string }>();
  const navigate = useNavigate();
  const workspace = useWorkspace(() => workspaceId);
  const actions = useWorkspaceActions();
  const [removing, setRemoving] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const base = paths.workspacePage(workspaceId, "agents-v2");
  const view = useAgentsV2(workspaceId, {
    done: (done) => {
      if (done.action === "create") {
        setSearch({ add: undefined });
        if (done.created) navigate(paths.agentV2(workspaceId, done.created));
      }
      if (done.action === "remove") {
        setRemoving(false);
        navigate(base);
      }
      actions.toast(agentsV2Toast(done.action, done.subject));
    },
  });
  const adding = () => search.add !== undefined && view.canCreate();
  // `?add=` opens Add agent over the page; leaving it, such as with Back, sets the draft aside.
  createEffect(
    on(adding, (add) => {
      view.dismiss();
      if (add) view.create.begin();
      else view.create.cancel();
    }),
  );
  // An agent's unsaved name and setup are set aside as its page closes.
  createEffect(
    on(
      () => params.agentId,
      (_, previous) => {
        if (previous !== undefined) view.reset(previous);
      },
      { defer: true },
    ),
  );
  const tab = (): AgentsV2Tab => (search.tab === "needs-setup" ? "needs-setup" : "all");
  const ofTab = createMemo(() =>
    view.agents().filter((agent) => tab() === "all" || agent.issues.length > 0),
  );
  const shown = createMemo(() => {
    const words = query().trim().toLocaleLowerCase();
    return ofTab().filter(
      (agent) => words === "" || agent.name.toLocaleLowerCase().includes(words),
    );
  });
  const add = () => setSearch({ add: "agent" });
  const failureOf = (action: AgentsV2Action) => {
    const failure = view.failure();
    return failure?.action === action ? failure : undefined;
  };
  const refreshing = () => view.pending() === "refresh";
  const name = () => workspace()?.workspace.name ?? "";
  const selected = () => (params.agentId === undefined ? undefined : view.agent(params.agentId));
  /** The selected agent's turns in progress, each opening its log beside its thread. */
  const turnsOfSelected = () => {
    const agent = selected();
    return agent === undefined
      ? []
      : view.turnsOf(agent.memberId).map((turn) => ({
          id: turn.id,
          state: turn.state,
          place: turn.place,
          href: href(paths.turnLog(workspaceId, turn.groupId, turn.threadId, turn.id)),
        }));
  };
  const tabHref = (next: AgentsV2Tab) => href(next === "all" ? base : `${base}?tab=${next}`);
  return (
    <>
      <Show
        when={params.agentId}
        keyed
        fallback={
          <AgentsV2Pane
            workspaceName={name()}
            tab={tab()}
            tabHref={tabHref}
            onTabChange={(next) => {
              setQuery("");
              setSearch({ tab: next === "all" ? undefined : next });
            }}
            counts={
              view.status()
                ? undefined
                : {
                    all: view.agents().length,
                    "needs-setup": view.agents().filter((agent) => agent.issues.length > 0).length,
                  }
            }
            onAdd={view.canCreate() ? add : undefined}
            status={view.status()}
            onRetry={view.refresh}
          >
            <AgentV2List
              tab={tab()}
              query={query()}
              onQueryChange={setQuery}
              agents={shown()}
              total={view.agents().length}
              agentHref={(id) => href(paths.agentV2(workspaceId, id))}
              onAdd={view.canCreate() ? add : undefined}
              failure={
                view.failure()?.action === "refresh" && !adding() ? view.failure() : undefined
              }
              onRefresh={view.refresh}
              refreshing={refreshing()}
            />
          </AgentsV2Pane>
        }
      >
        {(agentId) => (
          <AgentV2Pane
            workspaceName={name()}
            agent={selected()}
            status={view.status()}
            onRetry={view.refresh}
            onBrowse={() => navigate(base)}
            name={view.rename.name(agentId)}
            onNameChange={(value) => view.rename.setName(agentId, value)}
            nameChanged={view.rename.changed(agentId)}
            onSaveName={() => view.rename.save(agentId)}
            setup={view.setup.fields(agentId)}
            setupChanged={view.setup.changed(agentId)}
            onSaveSetup={() => view.setup.save(agentId)}
            onDiscardSetup={() => view.setup.discard(agentId)}
            onRemove={
              selected()?.configurable
                ? () => {
                    view.dismiss();
                    setRemoving(true);
                  }
                : undefined
            }
            turns={turnsOfSelected()}
            pending={view.pending()}
            failure={adding() || removing() ? undefined : view.failure()}
            onRefresh={view.refresh}
          />
        )}
      </Show>
      <AddAgentV2
        open={adding()}
        onClose={() => {
          if (view.pending() === undefined) setSearch({ add: undefined });
        }}
        workspaceName={name()}
        name={view.create.name()}
        onNameChange={view.create.setName}
        roles={view.roles()}
        roleId={view.create.roleId()}
        onRoleChange={view.create.setRole}
        setup={view.create.fields()}
        ready={view.create.ready()}
        onCreate={view.create.save}
        pending={view.pending() === "create"}
        failure={failureOf("create")}
        onRefresh={view.refresh}
        refreshing={refreshing()}
      />
      <Show when={selected()}>
        {(agent) => (
          <ConfirmRemoveAgentV2
            open={removing()}
            onClose={() => {
              if (view.pending() !== undefined) return;
              view.dismiss();
              setRemoving(false);
            }}
            name={agent().name}
            onConfirm={() => view.remove(agent().id)}
            pending={view.pending() === "remove"}
            failure={failureOf("remove")}
            onRefresh={view.refresh}
            refreshing={refreshing()}
          />
        )}
      </Show>
    </>
  );
}
