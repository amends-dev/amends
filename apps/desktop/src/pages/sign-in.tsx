import { SignIn } from "@amends/features/sign-in";
import { Shell } from "@amends/ui/compositions/shell";
import { Text } from "@amends/ui/primitives/text";

/** App-owned composition. Shell owns presentation; the route owns session navigation. */
export function SignInPage() {
  return (
    <Shell.Body scroll="page">
      <Shell.Header>
        <Text as="span" variant="heading">
          amends
        </Text>
      </Shell.Header>
      <Shell.Main>
        <Shell.Content width="narrow" centered>
          <SignIn.Root>
            <SignIn.EmailForm />
            <SignIn.CodeForm deliveryHint="Find your code in the terminal running the local host." />
          </SignIn.Root>
        </Shell.Content>
      </Shell.Main>
      <Shell.Footer>
        <Text variant="mono" tone="secondary">
          amends keeps one identity per address
        </Text>
      </Shell.Footer>
    </Shell.Body>
  );
}
