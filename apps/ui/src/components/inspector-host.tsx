import { createContext, type Accessor } from "solid-js";
export const InspectorHostContext = createContext<{
  mount: Accessor<HTMLDivElement | undefined>;
  width: Accessor<number>;
}>();
