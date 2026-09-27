// Workshop harness: signing in and choosing a workspace with working local state. Not exported.
import { For, Match, Switch, createSignal } from "solid-js";
import { Toast } from "../../components/toast/index.ts";
import {
  CreateWorkspace,
  WorkspacePicker,
  type PickerInvitation,
  type PickerWorkspace,
} from "../workspaces/index.ts";
import { SignInCode, SignInEmail } from "./index.ts";

/** The code the workshop accepts; any other six digits are refused. */
export const workshopCode = "314159";

const sampleWorkspaces: readonly PickerWorkspace[] = [
  { id: "mercier", name: "Mercier & Co", detail: "12 members", href: "#mercier" },
  { id: "fieldwork", name: "Fieldwork", detail: "4 members · Owner", href: "#fieldwork" },
];
const sampleInvitations: readonly PickerInvitation[] = [
  { id: "northstar", name: "Northstar Studio", detail: "Pending invitation · Expires in 7 days" },
  { id: "atlas", name: "Atlas Labs", detail: "Pending invitation · Expires in 3 days" },
];

export type EntryStep = "email" | "code" | "workspaces";

export interface EntryProps {
  readonly step?: EntryStep;
  readonly email?: string;
  readonly code?: string;
  readonly error?: string;
  readonly providers?: boolean;
  readonly workspaces?: "some" | "invitations" | "none";
  readonly creating?: boolean;
}

/** Sign-in by email and code, then the workspace picker with invitations and creation. */
export function Entry(props: EntryProps) {
  const [step, setStep] = createSignal<EntryStep>(props.step ?? "email");
  const [email, setEmail] = createSignal(props.email ?? "");
  const [emailError, setEmailError] = createSignal<string>();
  const [code, setCode] = createSignal(props.code ?? "");
  const [codeError, setCodeError] = createSignal(props.error);
  const [resent, setResent] = createSignal(false);
  const [workspaces, setWorkspaces] = createSignal(
    props.workspaces === "some" || props.workspaces === undefined ? sampleWorkspaces : [],
  );
  const [invitations, setInvitations] = createSignal(
    props.workspaces === "none" ? [] : sampleInvitations,
  );
  const [creating, setCreating] = createSignal(props.creating ?? false);
  const [name, setName] = createSignal(props.creating ? "New Ventures" : "");
  const [toasts, setToasts] = createSignal<ReadonlyArray<{ id: number; text: string }>>([]);
  let toastId = 0;
  const verify = (value: string) => {
    if (value === workshopCode) {
      setCodeError(undefined);
      setStep("workspaces");
    } else setCodeError("That code doesn’t match. Check it and try again.");
  };
  return (
    <>
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
              if (!email().includes("@"))
                setEmailError("Enter an email address like you@example.com.");
              else {
                setCode("");
                setCodeError(undefined);
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
            }}
            error={codeError()}
            onSubmit={verify}
            onResend={() => {
              setResent(true);
              setCode("");
              setCodeError(undefined);
            }}
            resent={resent()}
          />
        </Match>
        <Match when={step() === "workspaces"}>
          <WorkspacePicker
            homeHref="#"
            account={{ email: email() || "alex@mercier.example", name: "Alex", initials: "A" }}
            onSignOut={() => {
              setEmail("");
              setStep("email");
            }}
            workspaces={workspaces()}
            invitations={invitations()}
            onAccept={(id) => {
              const invitation = invitations().find((candidate) => candidate.id === id);
              if (!invitation) return;
              setInvitations(invitations().filter((candidate) => candidate.id !== id));
              setWorkspaces([
                ...workspaces(),
                { id, name: invitation.name, detail: "7 members", href: `#${id}` },
              ]);
              setToasts([...toasts(), { id: ++toastId, text: `Joined ${invitation.name}` }]);
            }}
            onCreateWorkspace={() => setCreating(true)}
          />
          <CreateWorkspace
            open={creating()}
            onClose={() => {
              setCreating(false);
              setName("");
            }}
            name={name()}
            onNameChange={setName}
            onCreate={() => {
              const created = name().trim();
              setWorkspaces([
                ...workspaces(),
                {
                  id: created.toLowerCase(),
                  name: created,
                  detail: "1 member · Owner",
                  href: `#${created.toLowerCase()}`,
                },
              ]);
              setCreating(false);
              setName("");
              setToasts([...toasts(), { id: ++toastId, text: `Created ${created}` }]);
            }}
          />
        </Match>
      </Switch>
      <Toast.Region>
        <For each={toasts()}>
          {(item) => (
            <Toast.Item
              onDismiss={() => setToasts(toasts().filter((other) => other.id !== item.id))}
            >
              {item.text}
            </Toast.Item>
          )}
        </For>
      </Toast.Region>
    </>
  );
}
