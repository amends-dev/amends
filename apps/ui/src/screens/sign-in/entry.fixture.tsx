// Workshop harness: signing in and choosing a workspace with working local state. Not exported.
import { Match, Switch, createSignal } from "solid-js";
import {
  CreateWorkspace,
  WorkspacePicker,
  type CreateWorkspaceError,
  type PickerAccept,
  type PickerInvitation,
  type PickerWorkspace,
} from "../workspaces/index.ts";
import { SignInCode, SignInEmail, type SignInCodeError, type SignInEmailError } from "./index.ts";

/** The code the workshop accepts; any other six digits are refused. */
export const workshopCode = "314159";
/** Invitations to this workspace fail, to show the error in the Join dialog. */
export const unavailableWorkspace = "Atlas Labs";

// Expiries and relative wording are measured from this moment, so stories stay stable.
const now = new Date("2026-09-27T12:00:00Z");
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);
const sampleWorkspaces: readonly PickerWorkspace[] = [
  { id: "mercier", name: "Mercier & Co", memberCount: 12, href: "#mercier" },
  { id: "fieldwork", name: "Fieldwork", memberCount: 4, owner: true, href: "#fieldwork" },
];
const sampleInvitations: readonly PickerInvitation[] = [
  {
    id: "northstar",
    workspaceId: "northstar",
    workspaceName: "Northstar Studio",
    expiresAt: inDays(7),
  },
  { id: "atlas", workspaceId: "atlas", workspaceName: unavailableWorkspace, expiresAt: inDays(3) },
];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type EntryStep = "email" | "code" | "workspaces";

export interface EntryProps {
  readonly step?: EntryStep;
  readonly email?: string;
  readonly code?: string;
  readonly error?: SignInCodeError;
  readonly providers?: boolean;
  readonly workspaces?: "some" | "invitations" | "none";
  readonly creating?: boolean;
  readonly refreshFailed?: boolean;
}

/** Sign-in by email and code, then the workspace picker with invitations and creation. */
export function Entry(props: EntryProps) {
  const [step, setStep] = createSignal<EntryStep>(props.step ?? "email");
  const [email, setEmail] = createSignal(props.email ?? "");
  const [emailError, setEmailError] = createSignal<SignInEmailError>();
  const [code, setCode] = createSignal(props.code ?? "");
  const [codeError, setCodeError] = createSignal(props.error);
  const [codePending, setCodePending] = createSignal<"verifying" | "resending">();
  const [resent, setResent] = createSignal(false);
  const [workspaces, setWorkspaces] = createSignal(
    props.workspaces === "some" || props.workspaces === undefined ? sampleWorkspaces : [],
  );
  const [invitations, setInvitations] = createSignal(
    props.workspaces === "none" ? [] : sampleInvitations,
  );
  const [accept, setAccept] = createSignal<PickerAccept>();
  const [refreshFailed, setRefreshFailed] = createSignal(props.refreshFailed ?? false);
  const [creating, setCreating] = createSignal(props.creating ?? false);
  const [name, setName] = createSignal(props.creating ? "New Ventures" : "");
  const [memberName, setMemberName] = createSignal("Alex");
  const [createError, setCreateError] = createSignal<CreateWorkspaceError>();
  const [createPending, setCreatePending] = createSignal(false);
  const verify = async (value: string) => {
    if (value.length < 6) return setCodeError("invalid-code");
    setCodePending("verifying");
    await wait(300);
    setCodePending(undefined);
    if (value !== workshopCode) return setCodeError("mismatch");
    setCodeError(undefined);
    setStep("workspaces");
  };
  const resend = async () => {
    setCodePending("resending");
    await wait(300);
    setCodePending(undefined);
    setResent(true);
    setCode("");
    setCodeError(undefined);
  };
  const join = async (id: string) => {
    const invitation = invitations().find((candidate) => candidate.id === id);
    if (!invitation) return;
    setAccept({ invitationId: id, pending: true, joined: false });
    await wait(300);
    if (invitation.workspaceName === unavailableWorkspace) {
      setAccept({ invitationId: id, pending: false, joined: false, error: "gone" });
      return;
    }
    setInvitations(invitations().filter((candidate) => candidate.id !== id));
    setWorkspaces([
      ...workspaces(),
      { id, name: invitation.workspaceName ?? id, memberCount: 7, href: `#${id}` },
    ]);
    setAccept({ invitationId: id, pending: false, joined: true });
  };
  const create = async () => {
    const created = name().trim();
    setCreatePending(true);
    await wait(300);
    setCreatePending(false);
    if (workspaces().some((workspace) => workspace.name === created))
      return setCreateError("request-reused");
    setWorkspaces([
      ...workspaces(),
      {
        id: created.toLowerCase(),
        name: created,
        memberCount: 1,
        owner: true,
        href: `#${created.toLowerCase()}`,
      },
    ]);
    setCreating(false);
    setName("");
  };
  return (
    <Switch>
      <Match when={step() === "email"}>
        <SignInEmail
          homeHref="#"
          email={email()}
          onEmailChange={(value) => {
            setEmail(value);
            setEmailError(undefined);
          }}
          error={emailError()}
          onSubmit={() => {
            if (!/^[^@\s]+@[^@\s]+$/u.test(email())) setEmailError("invalid-email");
            else {
              setCode("");
              setCodeError(undefined);
              setResent(false);
              setStep("code");
            }
          }}
          providers={
            props.providers ? [{ id: "google", label: "Continue with Google" }] : undefined
          }
          moreProviders={
            props.providers
              ? [
                  { id: "github", label: "Continue with GitHub" },
                  { id: "sso", label: "Continue with SSO" },
                ]
              : undefined
          }
        />
      </Match>
      <Match when={step() === "code"}>
        <SignInCode
          homeHref="#"
          email={email() || "alex@mercier.example"}
          onChangeEmail={() => setStep("email")}
          code={code()}
          onCodeChange={(value) => {
            setCode(value);
            setCodeError(undefined);
            setResent(false);
          }}
          error={codeError()}
          pending={codePending()}
          onSubmit={(value) => void verify(value)}
          onResend={() => void resend()}
          resent={resent()}
        />
      </Match>
      <Match when={step() === "workspaces"}>
        <WorkspacePicker
          homeHref="#"
          account={{
            identity: email() || "alex@mercier.example",
            onSignOut: () => {
              setEmail("");
              setStep("email");
            },
          }}
          workspaces={workspaces()}
          invitations={invitations()}
          refreshFailed={refreshFailed()}
          onRetry={() => setRefreshFailed(false)}
          accept={accept()}
          suggestedName="Alex"
          onAccept={(id) => void join(id)}
          onCreateWorkspace={() => setCreating(true)}
          now={now}
        />
        <CreateWorkspace
          open={creating()}
          onClose={() => {
            setCreating(false);
            setName("");
            setCreateError(undefined);
          }}
          name={name()}
          onNameChange={(value) => {
            setName(value);
            setCreateError(undefined);
          }}
          memberName={memberName()}
          onMemberNameChange={setMemberName}
          pending={createPending()}
          error={createError()}
          onCreate={() => void create()}
        />
      </Match>
    </Switch>
  );
}
