import { EntryShell, Text, type EntryShellProps } from "@amends/ui/components";
import { useAtom } from "@effect/atom-solid";
import { A, useNavigate } from "@solidjs/router";
import { href } from "../../routes.tsx";
import { sessionAtom } from "../../session/session.ts";

/** The entry chrome bound to this application's session and router. */
export function Entry(props: Omit<EntryShellProps, "home" | "account" | "links">) {
  const [session, setSession] = useAtom(() => sessionAtom);
  const navigate = useNavigate();
  return (
    <EntryShell
      {...props}
      home={{ href: href.picker({ choose: true }), renderLink: (link) => <A {...link} /> }}
      account={
        session() === undefined
          ? undefined
          : {
              name: session()!.identity,
              onSignOut: () => {
                setSession(undefined);
                navigate(href.signIn(), { replace: true });
              },
            }
      }
      links={
        <>
          <Text as="span" variant="caption" tone="muted">
            terms
          </Text>
          <Text as="span" variant="caption" tone="muted">
            privacy
          </Text>
        </>
      }
    />
  );
}
