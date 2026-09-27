import { useSession } from "@amends/client";
import type { StandaloneAccount } from "@amends/ui-v2/screens/standalone";

/** The signed-in identity and Sign out for a standalone screen's header, or none for guests. */
export function useStandaloneAccount(): () => StandaloneAccount | undefined {
  const session = useSession();
  return () => {
    const identity = session.session?.humanId;
    return identity === undefined
      ? undefined
      : { identity, onSignOut: () => session.replace(undefined) };
  };
}
