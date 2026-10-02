import { ConnectionImplementation } from "@amends/connection";
import { name } from "./daytona-sandbox.ts";

/**
 * A workspace's Daytona account: environments using the Daytona provider acquire sandboxes under
 * it. The API key is its credential; the API URL and target are optional settings.
 */
export const declaration: ConnectionImplementation.Declaration = {
  id: ConnectionImplementation.Id.make("daytona"),
  name: "Daytona",
  description: "A Daytona account that environments run their sandboxes under.",
  capabilities: { sandbox: { provider: name } },
  settings: [
    {
      key: "apiUrl",
      label: "API URL",
      kind: "url",
      required: false,
      description: "Leave empty to use Daytona's own API.",
      placeholder: "https://app.daytona.io/api",
    },
    {
      key: "target",
      label: "Target",
      kind: "text",
      required: false,
      description: "The region sandboxes run in, such as us or eu. Leave empty for your default.",
    },
  ],
  authentication: [{ _tag: "ApiKey", label: "API key" }],
};

export * as DaytonaConnection from "./daytona-connection.ts";
