# Turns

An agent's turn is its attempt at the work asked of it on a thread (see
[core's turns](../packages/core/README.md#turns)). Both apps show turns where the work happens:
in the thread's timeline, as marks where agents are at work, and in each turn's log. The
screens follow the Lunacy "Turn activity" frames, with the Amends Logo board's motions for the
states of a turn at work.

- **In the thread:** each turn is a compact row in the timeline where its agent took on the work,
  read from the thread's own activity: the agent, its state (Queued, Working, Stopping…, Stopped,
  Failed, or Completed without a reply), View log, and Stop while it is active or Retry once it
  failed or stopped, for a reader who may direct the agent. Messages posted while it works follow
  its row. A failure names its reason and links to the agent's page (`/agents/:agentId`); a turn
  stopped because its agent left the thread says so and offers no retry. A retry leaves the failed
  or stopped turn where it was, no longer offering Retry, and the new attempt's row follows at the
  end. A turn that replied shows no row: its replies stand for it, and their actions offer View
  turn log. Scrolling back shows older turns with the messages around them.
  Stop shows Stopping… at once and stays disabled until the turn stops; if it already finished,
  the row says so and shows what actually happened. Leaving the thread never stops a turn.
- **Where agents work:** a thread's replies in its group's stream say "Yumi working", and the
  sidebar marks a group whose threads have agents at work with the most pressing state. The Agents
  page shows each agent's current activity beside its setup: Idle, or its state with the threads
  it works in, "#general + 1 more". Queued, working, and stopping move as the logo's `thread`,
  `working`, and `tug` motions, still for readers who prefer reduced motion.
- **The log:** View log replaces the thread in the side panel (`?log=:turnId` on the thread's
  route); Back returns to the thread with its reply draft kept, and closing leaves both. The log
  names where the turn runs and the model access and environment it started with, then its
  activity with times: work accepted, the turn started, each batch of the thread's input taken in,
  each response, interruptions it recovered from, and how it ended. While the agent writes, its
  reply streams into a draft marked "not posted to the thread yet", which the completed response
  replaces. The log follows the turn over its own stream, which opens with the log as it stands
  and carries each change and the text being written until the turn ends. The footer follows live; scrolling up keeps the reader where they are and offers "New
  activity · Jump to latest". While live updates reconnect, the log says so, pauses the draft, and
  shows when it last updated; a failed turn offers Retry turn and the agent's settings, and a
  completed one View reply in thread. On phones the log is full-screen.

Threads have no titles yet, so the log names a thread by its group ("Thread in #general"). The
mocks' popover listing an agent's active turns on the Agents page is not built; the row lists
where it works instead. Drafts are best effort: text missed while reconnecting shows once the
response completes. See [known limitations](current-status.md) for what turns do not do yet.
