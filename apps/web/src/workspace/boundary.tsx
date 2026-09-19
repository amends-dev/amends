import type { Workspace } from "@amends/core/workspace";
import type { WorkspaceDirectory } from "@amends/gateway/directory";
import type { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createMemo, Show, type JSX, type ParentProps } from "solid-js";
import { Me } from "../api/me.ts";
import { useQuery } from "../api/hooks.ts";
import { valueOf } from "../api/errors.ts";
import { WorkspaceContext } from "./context.tsx";

type Props = ParentProps<{
  workspaceId: Workspace.Id;
  loading: JSX.Element;
  error: (cause: Cause.Cause<unknown>, retry: () => void) => JSX.Element;
  unavailable: (membership: WorkspaceDirectory.Membership | undefined) => JSX.Element;
}>;
/** Resolves access without choosing a visual frame or reading router state. */
export function WorkspaceBoundary(props: Props) {
  return (
    <Show when={props.workspaceId} keyed>
      {(workspaceId) => <Resolved {...props} workspaceId={workspaceId} />}
    </Show>
  );
}
function Resolved(props: Props) {
  const query = useQuery(Me.workspaces);
  const listing = createMemo(() => valueOf(query.result()));
  const membership = createMemo(() => {
    const mine = listing()?.memberships.filter((item) => item.workspace.id === props.workspaceId);
    return mine?.find((item) => item.member.status === "active") ?? mine?.[0];
  });
  const active = createMemo(() => {
    const current = membership();
    return current?.member.status === "active" ? current : undefined;
  });
  const fallback = () => {
    const result = query.result();
    return AsyncResult.isFailure(result) ? props.error(result.cause, query.refresh) : props.loading;
  };
  return (
    <Show when={listing()} fallback={fallback()}>
      <Show when={active()} fallback={props.unavailable(membership())}>
        {(current) => (
          <WorkspaceContext.Provider value={current}>{props.children}</WorkspaceContext.Provider>
        )}
      </Show>
    </Show>
  );
}
