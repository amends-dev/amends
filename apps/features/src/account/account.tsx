import { useAppearance, useSession } from "@amends/client";
import { AccountMenu } from "@amends/ui/features/account";
import { ThemeChoice } from "@amends/ui/features/appearance";

export const Root = AccountMenu.Root;
export const Content = AccountMenu.Content;
export const Actions = AccountMenu.Actions;
export const Link = AccountMenu.Link;
const initials = (identifier: string) =>
  Array.from(identifier).slice(0, 2).join("").toLocaleUpperCase();
export function Trigger() {
  const session = useSession();
  return (
    <AccountMenu.Trigger
      label={`Your account: ${session.session?.humanId ?? "Signed out"}`}
      initials={initials(session.session?.humanId ?? "?")}
    />
  );
}
export function Identity() {
  const session = useSession();
  return (
    <AccountMenu.Identity
      identifier={session.session?.humanId ?? "Signed out"}
      initials={initials(session.session?.humanId ?? "?")}
    />
  );
}
export function Appearance() {
  const appearance = useAppearance();
  return <ThemeChoice value={appearance.preference()} onValueChange={appearance.setPreference} />;
}
export function SignOut() {
  const session = useSession();
  return <AccountMenu.SignOut onClick={() => session.replace(undefined)} />;
}
