import { Dynamic } from "solid-js/web";
import {
  IconTrash,
  IconMarkHome,
  IconMarkMail,
  IconMarkChannel,
  IconMarkAgents,
  IconMarkSettings,
  IconMarkNew,
  IconMarkSearch,
  IconBell,
  IconUser,
} from "@amends/icons";

const icons = {
  trash: IconTrash,
  home: IconMarkHome,
  threads: IconMarkMail,
  groups: IconMarkChannel,
  members: IconMarkAgents,
  settings: IconMarkSettings,
  plus: IconMarkNew,
  search: IconMarkSearch,
  bell: IconBell,
  account: IconUser,
} as const;
/** Story-only semantic aliases; every glyph comes from the production icon package. */
export function DemoIcon(props: { name: keyof typeof icons }) {
  return <Dynamic component={icons[props.name]} />;
}
