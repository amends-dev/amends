import { Member, type Ownership } from "@amends/core/workspace";
import {
  Button,
  ConfirmationDialog,
  FormActions,
  FormLayout,
  Notice,
  RadioCardGroup,
  Section,
  Text,
} from "@amends/ui/components";
import { Exit } from "effect";
import { createSignal, Show } from "solid-js";
import { useCommand, useQuery } from "../../api/hooks.ts";
import { explain } from "../../api/errors.ts";
import { Workspaces } from "../../api/workspaces.ts";
import { QueryView } from "../../components/query-view.tsx";
import { useWorkspace } from "../../workspace/context.tsx";

export function TransferOwnership() {
  const opened = useWorkspace();
  return (
    <Show when={opened().workspace.id} keyed>
      {(workspaceId) => <Transfer workspaceId={workspaceId} />}
    </Show>
  );
}
function Transfer(props: { workspaceId: Ownership.View["workspace"]["id"] }) {
  const query = useQuery(() => Workspaces.ownership(props.workspaceId));
  const command = useCommand(Workspaces.makeTransferOwnership());
  const [selected, setSelected] = createSignal<Member.Id>();
  // The dialog retains exactly the recipient and authority the user reviewed, even during refresh.
  const [proposal, setProposal] = createSignal<{ input: Ownership.TransferInput; name: string }>();
  const [completed, setCompleted] = createSignal<string>();
  const [error, setError] = createSignal<string>();
  const confirm = async () => {
    const reviewed = proposal();
    if (!reviewed || command.pending()) return;
    setError(undefined);
    const exit = await command.run({ workspaceId: props.workspaceId, payload: reviewed.input });
    if (exit && Exit.isSuccess(exit)) {
      setProposal(undefined);
      setSelected(undefined);
      setCompleted(reviewed.name);
    } else if (exit && Exit.isFailure(exit)) {
      setError(explain(exit.cause));
    }
  };
  return (
    <Section title="Ownership">
      <QueryView result={query.result()} retry={query.refresh} loading="Loading ownership…">
        {(view) => (
          <>
            <Text>Current owner: {view().owner.identity.id}</Text>
            <Show
              when={view().canTransfer}
              fallback={
                <Text variant="caption">
                  Only the current owner with transfer permission can transfer ownership.
                </Text>
              }
            >
              <Show
                when={view().candidates.length > 0}
                fallback={<Text>Invite another person before transferring ownership.</Text>}
              >
                <FormLayout
                  onSubmit={(event) => {
                    event.preventDefault();
                    const candidate = view().candidates.find(({ id }) => id === selected());
                    if (!candidate || command.pending()) return;
                    setError(undefined);
                    setProposal({
                      input: {
                        memberId: candidate.id,
                        expectedOwnerAssignmentId: view().ownerAssignmentId,
                      },
                      name: candidate.identity.id,
                    });
                  }}
                >
                  <RadioCardGroup
                    label="New owner"
                    value={selected() ?? ""}
                    onChange={(value) => setSelected(Member.Id.make(value))}
                    disabled={command.pending()}
                    options={view().candidates.map((member) => ({
                      value: member.id,
                      label: member.identity.id,
                    }))}
                  />
                  <Text>
                    You will become an Administrator. The new owner will manage administrator access
                    and future ownership transfers.
                  </Text>
                  <FormActions
                    primary={
                      <Button
                        type="submit"
                        disabled={
                          command.pending() ||
                          !view().candidates.some(({ id }) => id === selected())
                        }
                      >
                        Review transfer
                      </Button>
                    }
                  />
                </FormLayout>
              </Show>
            </Show>
          </>
        )}
      </QueryView>
      <Show when={completed()}>
        {(name) => (
          <Notice live="polite">
            Ownership transferred to {name()}. You are now an Administrator.
          </Notice>
        )}
      </Show>
      <Button variant="secondary" disabled={command.pending()} onClick={query.refresh}>
        Refresh ownership
      </Button>
      <ConfirmationDialog
        open={proposal() !== undefined}
        onOpenChange={(open) => {
          if (!open && !command.pending()) setProposal(undefined);
        }}
        title="Transfer ownership"
        description={`${proposal()?.name ?? "The selected person"} will become the owner. You will become an Administrator.`}
        confirmLabel="Transfer ownership"
        cancelLabel="Cancel"
        tone="neutral"
        pending={command.pending()}
        onConfirm={() => void confirm()}
        error={error()}
      />
    </Section>
  );
}
