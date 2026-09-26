import { Data, Exit } from "effect";
import { createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import {
  createWorkspaceRequest,
  isMemberName,
  isWorkspaceName,
  suggestedName,
  newWorkspaceRequestKey,
  workspaceRejection,
  type CreatedWorkspace,
} from "../api/workspaces.ts";
import { useRequest } from "../request/use-request.ts";
import { useSession } from "../session/provider.tsx";
export type CreateWorkspaceState = Data.TaggedEnum<{
  Form: {
    readonly name: string;
    /** What people there will call the creator, suggested from their identity. */
    readonly memberName: string;
    readonly pending: boolean;
    readonly error:
      | "invalid-name"
      | "invalid-member-name"
      | "denied"
      | "request-reused"
      | "request-failed"
      | undefined;
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
  readonly setMemberName: (name: string) => void;
  readonly submit: (name?: string) => void;
  readonly retryRefresh: () => void;
}

/** A mounted creation intent. Retries of the same name retain its idempotency key. */
export function useCreateWorkspace(): CreateWorkspaceController {
  const session = useSession();
  const [state, setState] = createSignal<CreateWorkspaceState>(
    State.Form({
      name: "",
      memberName: suggestedName(session.session?.humanId),
      pending: false,
      error: undefined,
    }),
  );
  let intent:
    | { name: string; memberName: string; key: ReturnType<typeof newWorkspaceRequestKey> }
    | undefined;
  const request = useRequest(
    createWorkspaceRequest(useApiClient()),
    (exit, input) => {
      const snapshot = state();
      if (Exit.isFailure(exit)) {
        if (snapshot._tag === "Form")
          setState(
            State.Form({ ...snapshot, pending: false, error: workspaceRejection(exit.cause) }),
          );
        else if (snapshot._tag === "Created")
          setState(State.Created({ ...snapshot, pending: false, refreshFailed: true }));
        return;
      }
      if (input.kind === "create" && snapshot._tag === "Form" && exit.value) {
        setState(State.Created({ workspace: exit.value, pending: false, refreshFailed: false }));
        refresh();
      } else if (input.kind === "refresh" && snapshot._tag === "Created")
        setState(State.Ready({ workspace: snapshot.workspace }));
    },
    { when: () => session.session !== undefined },
  );
  function refresh() {
    const value = state();
    if (value._tag !== "Created" || value.pending || request.pending()) return;
    setState(State.Created({ ...value, pending: true, refreshFailed: false }));
    if (!request.run({ kind: "refresh" })) setState(value);
  }
  return {
    state,
    setName: (name) => {
      const value = state();
      if (value._tag === "Form" && !value.pending && session.isCurrent())
        setState(State.Form({ ...value, name, pending: false, error: undefined }));
    },
    setMemberName: (memberName) => {
      const value = state();
      if (value._tag === "Form" && !value.pending && session.isCurrent())
        setState(State.Form({ ...value, memberName, pending: false, error: undefined }));
    },
    submit: (name) => {
      const value = state();
      if (value._tag !== "Form" || value.pending || request.pending() || !session.isCurrent())
        return;
      const submitted = (name ?? value.name).trim();
      if (!isWorkspaceName(submitted)) {
        setState(State.Form({ ...value, name: name ?? value.name, error: "invalid-name" }));
        return;
      }
      // A name is optional; without one, people see the creator's identity.
      const memberName = value.memberName.trim();
      if (memberName !== "" && !isMemberName(memberName)) {
        setState(State.Form({ ...value, name: submitted, error: "invalid-member-name" }));
        return;
      }
      if (intent?.name !== submitted || intent.memberName !== memberName)
        intent = { name: submitted, memberName, key: newWorkspaceRequestKey() };
      setState(
        State.Form({ ...value, name: submitted, memberName, pending: true, error: undefined }),
      );
      if (!request.run({ kind: "create", ...intent })) setState(value);
    },
    retryRefresh: refresh,
  };
}
