import { createContext, type Accessor } from "solid-js";
/** Shell supplies presentation/activation behavior without navigation depending on Shell. */
export const NavigationPresentationContext = createContext<{
  compact: Accessor<boolean>;
  close: () => void;
}>({ compact: () => false, close: () => {} });
