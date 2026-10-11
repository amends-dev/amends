import type { CreateWorkspaceError } from "@amends-dev/ui/screens/workspaces";
import { Data, Exit } from "effect";
import { createSignal, type Accessor } from "solid-js";
import { directoryQuery } from "../api/directory.ts";
import { useMutation } from "../api/mutation.ts";
import { refreshResult } from "../api/refresh.ts";
import {
  createWorkspace,
  isMemberName,
  isWorkspaceName,
  suggestedName,
  newWorkspaceRequestKey,
  workspaceRejection,
  type CreatedWorkspace,
  type NewWorkspace,
} from "./api.ts";
import { useApiClient, useSession } from "../provider.tsx";
export type CreateWorkspaceState = Data.TaggedEnum<{
  Form: {
    readonly name: string;
    /** What people there will call the creator, suggested from their identity. */
    readonly memberName: string;
    readonly pending: boolean;
    readonly error: CreateWorkspaceError | undefined;
  };
  Created: {
    readonly workspace: CreatedWorkspace;
    readonly pending: boolean;
    readonly refreshFailed: boolean;
  };
  Ready: { readonly workspace: CreatedWorkspace };
}>;
export const CreateWorkspaceState = Data.taggedEnum<CreateWorkspaceState>();
export interface CreateWorkspaceController {
  readonly state: Accessor<CreateWorkspaceState>;
  readonly setName: (name: string) => void;
  readonly setMemberName: (name: string) => void;
  readonly submit: (name?: string) => void;
  readonly retryRefresh: () => void;
}

/**
 * A mounted creation intent: create the workspace, then reload the directory so that its pages
 * open. Retries of the same name keep its idempotency key.
 */
export function useCreateWorkspace(): CreateWorkspaceController {
  const session = useSession();
  const client = useApiClient();
  const [state, setState] = createSignal<CreateWorkspaceState>(
    CreateWorkspaceState.Form({
      name: "",
      memberName: suggestedName(session.session?.account.email),
      pending: false,
      error: undefined,
    }),
  );
  let intent: NewWorkspace | undefined;
  const create = useMutation(createWorkspace);
  const reload = useMutation(() => refreshResult(directoryQuery(client)));
  async function submit(draft?: string) {
    const value = state();
    if (!CreateWorkspaceState.$is("Form")(value) || value.pending) return;
    const name = (draft ?? value.name).trim();
    if (!isWorkspaceName(name)) {
      setState(
        CreateWorkspaceState.Form({ ...value, name: draft ?? value.name, error: "invalid-name" }),
      );
      return;
    }
    const memberName = value.memberName.trim();
    if (!isMemberName(memberName)) {
      setState(CreateWorkspaceState.Form({ ...value, name, error: "invalid-member-name" }));
      return;
    }
    if (intent?.name !== name || intent.memberName !== memberName)
      intent = { name, memberName, key: newWorkspaceRequestKey() };
    const submitting = CreateWorkspaceState.Form({
      ...value,
      name,
      memberName,
      pending: true,
      error: undefined,
    });
    setState(submitting);
    const exit = await create.run(intent);
    if (exit === undefined) return;
    if (Exit.isFailure(exit)) {
      setState(
        CreateWorkspaceState.Form({
          ...submitting,
          pending: false,
          error: workspaceRejection(exit.cause),
        }),
      );
      return;
    }
    setState(
      CreateWorkspaceState.Created({ workspace: exit.value, pending: false, refreshFailed: false }),
    );
    await reloadDirectory();
  }
  async function reloadDirectory() {
    const value = state();
    if (!CreateWorkspaceState.$is("Created")(value) || value.pending) return;
    setState(CreateWorkspaceState.Created({ ...value, pending: true, refreshFailed: false }));
    const exit = await reload.run();
    if (exit === undefined) return;
    if (Exit.isSuccess(exit)) setState(CreateWorkspaceState.Ready({ workspace: value.workspace }));
    else setState(CreateWorkspaceState.Created({ ...value, pending: false, refreshFailed: true }));
  }
  return {
    state,
    setName: (name) => {
      const value = state();
      if (CreateWorkspaceState.$is("Form")(value) && !value.pending)
        setState(CreateWorkspaceState.Form({ ...value, name, pending: false, error: undefined }));
    },
    setMemberName: (memberName) => {
      const value = state();
      if (CreateWorkspaceState.$is("Form")(value) && !value.pending)
        setState(
          CreateWorkspaceState.Form({ ...value, memberName, pending: false, error: undefined }),
        );
    },
    submit: (name) => void submit(name),
    retryRefresh: () => void reloadDirectory(),
  };
}
