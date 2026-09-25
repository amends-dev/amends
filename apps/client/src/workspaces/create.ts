import { useAtomSet, useAtomValue } from "@effect/atom-solid";
import { Data, Exit } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { isUnauthorized } from "../api/client.ts";
import {
  createWorkspaceRequest,
  isWorkspaceName,
  newWorkspaceRequestKey,
  workspaceRejection,
  type CreatedWorkspace,
  type WorkspaceRequest,
} from "../api/workspaces.ts";
import { useSession } from "../session/provider.tsx";

export type CreateWorkspaceState = Data.TaggedEnum<{
  Form: {
    readonly name: string;
    readonly pending: boolean;
    readonly error: "invalid-name" | "denied" | "request-reused" | "request-failed" | undefined;
  };
  Created: {
    readonly workspace: CreatedWorkspace;
    readonly pending: boolean;
    readonly refreshFailed: boolean;
  };
  Ready: { readonly workspace: CreatedWorkspace };
}>;
const State = Data.taggedEnum<CreateWorkspaceState>();
export interface CreateWorkspaceController {
  readonly state: Accessor<CreateWorkspaceState>;
  readonly setName: (name: string) => void;
  readonly submit: (name?: string) => void;
  readonly retryRefresh: () => void;
}

/** A mounted creation intent. Retries of the same name retain its idempotency key. */
export function useCreateWorkspace(): CreateWorkspaceController {
  const session = useSession();
  const request = createWorkspaceRequest(useApiClient());
  const result = useAtomValue(() => request);
  const execute = useAtomSet(() => request);
  const [state, setState] = createSignal<CreateWorkspaceState>(
    State.Form({ name: "", pending: false, error: undefined }),
  );
  let alive = true;
  let sequence = 0;
  let active: number | undefined;
  let intent: { name: string; key: ReturnType<typeof newWorkspaceRequestKey> } | undefined;
  const current = () => alive && session.isCurrent() && !!session.session;
  onCleanup(() => {
    alive = false;
    active = undefined;
  });
  const begin = (command: WorkspaceRequest) => {
    active = command.attempt;
    execute(command);
  };
  const refresh = () => {
    const value = state();
    if (!current() || value._tag !== "Created" || value.pending) return;
    setState(State.Created({ ...value, pending: true, refreshFailed: false }));
    begin({ attempt: ++sequence, kind: "refresh" });
  };
  createEffect(
    on(result, (outcome) => {
      if (!current() || active === undefined || outcome.waiting || AsyncResult.isInitial(outcome))
        return;
      if (AsyncResult.isSuccess(outcome) && outcome.value.attempt !== active) return;
      active = undefined;
      const snapshot = state();
      const exit = AsyncResult.isSuccess(outcome)
        ? outcome.value.exit
        : Exit.failCause(outcome.cause);
      if (Exit.isFailure(exit)) {
        if (isUnauthorized(exit.cause)) {
          session.replace(undefined);
          return;
        }
        if (snapshot._tag === "Form")
          setState(
            State.Form({ ...snapshot, pending: false, error: workspaceRejection(exit.cause) }),
          );
        else if (snapshot._tag === "Created")
          setState(State.Created({ ...snapshot, pending: false, refreshFailed: true }));
        return;
      }
      if (snapshot._tag === "Form" && exit.value) {
        setState(State.Created({ workspace: exit.value, pending: false, refreshFailed: false }));
        refresh();
      } else if (snapshot._tag === "Created")
        setState(State.Ready({ workspace: snapshot.workspace }));
    }),
  );
  return {
    state,
    setName: (name) => {
      const value = state();
      if (current() && value._tag === "Form" && !value.pending)
        setState(State.Form({ name, pending: false, error: undefined }));
    },
    submit: (name) => {
      const value = state();
      if (!current() || value._tag !== "Form" || value.pending) return;
      const submitted = (name ?? value.name).trim();
      if (!isWorkspaceName(submitted)) {
        setState(State.Form({ name: name ?? value.name, pending: false, error: "invalid-name" }));
        return;
      }
      if (intent?.name !== submitted) intent = { name: submitted, key: newWorkspaceRequestKey() };
      setState(State.Form({ name: submitted, pending: true, error: undefined }));
      begin({ attempt: ++sequence, kind: "create", ...intent });
    },
    retryRefresh: refresh,
  };
}
