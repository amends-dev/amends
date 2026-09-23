import { createContext, useContext, type ParentProps } from "solid-js";
import type { ApiClient } from "./client.ts";

const ApiContext = createContext<ApiClient>();
export function ApiProvider(props: ParentProps<{ client: ApiClient }>) {
  return <ApiContext.Provider value={props.client}>{props.children}</ApiContext.Provider>;
}
export function useApiClient() {
  const client = useContext(ApiContext);
  if (!client) throw new Error("API operations require ClientProvider.");
  return client;
}
