import { Assignment, BuiltinRoles, Role } from "@amends/core/authorization";
import type { Member } from "@amends/core/workspace";
import {
  Button,
  FormActions,
  FormLayout,
  RadioCardGroup,
  Section,
  Text,
} from "@amends/ui/components";
import { createSignal, For, Show } from "solid-js";
import { Assignments } from "../../api/assignments.ts";
import { useCommand, useQuery } from "../../api/hooks.ts";
import { CommandError, QueryView } from "../../components/query-view.tsx";
import { useWorkspace } from "../../workspace/context.tsx";

export function MemberAccess(props: { memberId: Member.Id }) {
  const workspace = useWorkspace();
  const query = useQuery(() => Assignments.list(workspace().workspace.id, props.memberId));
  const change = useCommand(Assignments.makeChange());
  const revoke = useCommand(Assignments.makeRevoke());
  const [selected, setSelected] = createSignal<Role.Id>();
  const pending = () => change.pending() || revoke.pending();
  const workspaceRoles = (access: Assignment.Access) =>
    access.assignments.filter(
      ({ source }) => source._tag === "Role" && source.scope._tag === "Workspace",
    );
  const chosen = (access: Assignment.Access) => {
    const source = workspaceRoles(access)[0]?.source;
    return selected() ?? (source?._tag === "Role" ? source.roleId : BuiltinRoles.ViewerId);
  };
  const label = (assignment: Assignment.Record, access: Assignment.Access) => {
    const source = assignment.source;
    if (source._tag === "Direct") return `Direct permission: ${source.grant.permission}`;
    const name =
      access.roles.find(({ role }) => role.id === source.roleId)?.role.name ?? source.roleId;
    return source.scope._tag === "Workspace" ? name : `${name} (specific resource)`;
  };
  return (
    <Section title="Access">
      <QueryView result={query.result()} retry={query.refresh} loading="Loading access…">
        {(access) => (
          <>
            <Show
              when={access().assignments.length > 0}
              fallback={<Text>No access assignments.</Text>}
            >
              <For each={access().assignments}>
                {(assignment) => (
                  <div>
                    <Text>{label(assignment, access())}</Text>
                    <Show when={access().canManage}>
                      <Button
                        variant="secondary"
                        disabled={pending()}
                        onClick={() =>
                          void revoke.run({
                            workspaceId: workspace().workspace.id,
                            memberId: props.memberId,
                            assignmentId: assignment.id,
                          })
                        }
                      >
                        Revoke {label(assignment, access())}
                      </Button>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
            <Show when={access().canManage}>
              <FormLayout
                onSubmit={(event) => {
                  event.preventDefault();
                  if (pending()) return;
                  void change.run({
                    workspaceId: workspace().workspace.id,
                    payload: {
                      memberId: props.memberId,
                      roleId: chosen(access()),
                      expectedAssignmentIds: workspaceRoles(access()).map(({ id }) => id),
                    },
                  });
                }}
              >
                <RadioCardGroup
                  label="Workspace role"
                  value={chosen(access())}
                  onChange={(value) => setSelected(Role.Id.make(value))}
                  disabled={pending()}
                  options={access()
                    .roles.filter(({ assignable }) => assignable)
                    .map(({ role }) => ({ value: role.id, label: role.name }))}
                />
                <Show when={access().assignments.length !== workspaceRoles(access()).length}>
                  <Text variant="caption">
                    Changing the workspace role keeps additional direct grants and access to
                    specific resources.
                  </Text>
                </Show>
                <FormActions
                  primary={
                    <Button type="submit" pending={change.pending()} disabled={pending()}>
                      Change role
                    </Button>
                  }
                />
              </FormLayout>
            </Show>
          </>
        )}
      </QueryView>
      <CommandError result={change.result()} />
      <CommandError result={revoke.result()} />
      <Button variant="secondary" disabled={pending()} onClick={query.refresh}>
        Refresh access
      </Button>
    </Section>
  );
}
