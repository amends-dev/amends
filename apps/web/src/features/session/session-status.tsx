import { Text } from "@amends/ui/components";
import { useSession } from "../../session/boundary.tsx";
export function SessionStatus() {
  const session = useSession();
  return (
    <Text as="span" variant="caption" tone="muted">
      {session.session
        ? `signed in as ${session.session.humanId}`
        : "amends keeps one identity per address"}
    </Text>
  );
}
