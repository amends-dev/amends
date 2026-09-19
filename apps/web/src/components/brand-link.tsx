import { Text, WorkspaceMark } from "@amends/ui/components";
import { A } from "@solidjs/router";
import { href } from "../routes.tsx";
import * as s from "./chrome.css.ts";
export function BrandLink() {
  return (
    <A href={href.picker({ choose: true })} class={s.brand} aria-label="amends">
      <WorkspaceMark name="amends" />
      <Text as="span" variant="subheading">
        amends
      </Text>
    </A>
  );
}
