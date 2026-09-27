import type { Meta, StoryObj } from "storybook-solidjs-vite";
import {
  CheckingSessionScreen,
  CrashedScreen,
  HostUnavailableScreen,
  NotFoundScreen,
  WorkspaceUnavailableScreen,
} from "./index.ts";

const meta = {
  title: "Screens/Standalone",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

const account = { identity: "alex@mercier.example", onSignOut: () => {} };

/** While a restored session is checked. */
export const CheckingSession = {
  render: () => <CheckingSessionScreen homeHref="#" account={account} />,
} satisfies Story;

/** The host did not answer; the reader stays signed in. */
export const HostUnavailable = {
  render: () => <HostUnavailableScreen homeHref="#" account={account} onRetry={() => {}} />,
} satisfies Story;

/** No route matches, for a guest. */
export const NotFound = {
  render: () => <NotFoundScreen homeHref="#" signedIn={false} onContinue={() => {}} />,
} satisfies Story;

/** An unexpected error stopped the app. */
export const Crashed = {
  render: () => <CrashedScreen homeHref="#" onReload={() => {}} />,
} satisfies Story;

/** An invitation waits for this workspace. */
export const WorkspaceInvited = {
  render: () => (
    <WorkspaceUnavailableScreen
      homeHref="#"
      account={account}
      identity={account.identity}
      access={{ reason: "invited", workspaceName: "Northstar Studio" }}
      onWorkspaces={() => {}}
    />
  ),
} satisfies Story;

/** The reader's membership ended. */
export const WorkspaceRemoved = {
  render: () => (
    <WorkspaceUnavailableScreen
      homeHref="#"
      account={account}
      identity={account.identity}
      access={{ reason: "removed", workspaceName: "Fieldwork" }}
      onWorkspaces={() => {}}
    />
  ),
} satisfies Story;

/** No record of this workspace for the reader. */
export const WorkspaceUnknown = {
  render: () => (
    <WorkspaceUnavailableScreen
      homeHref="#"
      account={account}
      identity={account.identity}
      access={{ reason: "unknown" }}
      onWorkspaces={() => {}}
    />
  ),
} satisfies Story;
