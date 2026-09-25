import { useSession } from "@amends/client";
import { Shell } from "@amends/ui/compositions/shell";
import { Button } from "@amends/ui/primitives/button";
import { Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { Show, type ParentProps } from "solid-js";

function Account() {
  const session = useSession();
  return (
    <Show when={session.session}>
      {(current) => (
        <Row>
          <Text as="span" variant="mono" tone="secondary">
            {current().humanId}
          </Text>
          <Button variant="secondary" onClick={() => session.replace(undefined)}>
            Sign out
          </Button>
        </Row>
      )}
    </Show>
  );
}
/**
 * A page outside any workspace: the brand, the signed-in account when there is one, and
 * centered content. Pass `account={false}` outside ClientProvider, where no session exists.
 */
export function StandalonePage(props: ParentProps<{ readonly account?: boolean }>) {
  return (
    <Shell.Body scroll="page">
      <Shell.Header>
        <Text as="span" variant="heading">
          amends
        </Text>
        <Show when={props.account ?? true}>
          <Account />
        </Show>
      </Shell.Header>
      <Shell.Main>
        <Shell.Content width="narrow" centered>
          {props.children}
        </Shell.Content>
      </Shell.Main>
    </Shell.Body>
  );
}
