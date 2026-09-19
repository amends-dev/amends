import { Text } from "@amends/ui/components";
import * as s from "./chrome.css.ts";
/** Destinations are not published yet; retain the existing plain-text labels. */
export function PolicyLinks() {
  return (
    <span class={s.links}>
      <Text as="span" variant="caption" tone="muted">
        terms
      </Text>
      <Text as="span" variant="caption" tone="muted">
        privacy
      </Text>
    </span>
  );
}
