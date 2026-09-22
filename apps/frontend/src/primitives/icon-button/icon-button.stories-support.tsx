import { Dynamic } from "solid-js/web";
import {
  IconTrash,
  IconHome,
  IconMessage,
  IconFolder,
  IconUsers,
  IconSettings,
  IconPlus,
  IconSearch,
  IconBell,
  IconUser,
} from "@amends/icons";

const icons = {
  trash: IconTrash,
  home: IconHome,
  threads: IconMessage,
  groups: IconFolder,
  members: IconUsers,
  settings: IconSettings,
  plus: IconPlus,
  search: IconSearch,
  bell: IconBell,
  account: IconUser,
} as const;
/** Story-only semantic aliases; every glyph comes from the production icon package. */
export function DemoIcon(props: { name: keyof typeof icons }) {
  return <Dynamic component={icons[props.name]} />;
}
