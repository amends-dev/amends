import { useAppearance } from "@amends/client";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Pane } from "@amends/ui-v2/patterns/pane";
import { Shell } from "@amends/ui-v2/patterns/shell";
import type { ParentProps } from "solid-js";

/**
 * A page without a UI v2 design yet: its previous content, in the previous UI's theme, inside a
 * pane with the page's title. Remove it as pages move to UI v2.
 */
export function LegacyPage(props: ParentProps<{ readonly title: string }>) {
  const appearance = useAppearance();
  return (
    <Pane.Root>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title>{props.title}</Pane.Title>
      </Pane.Header>
      <Pane.Body>
        <ThemeProvider theme={appearance.resolved() === "dark" ? "soot" : "cotton"}>
          {props.children}
        </ThemeProvider>
      </Pane.Body>
    </Pane.Root>
  );
}
