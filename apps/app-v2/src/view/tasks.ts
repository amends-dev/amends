/** Task labels and status shapes. */

import type { Task } from "@amends-dev/core/task"
import type { TaskStatusShape } from "@amends-dev/design/mark"

/** A task's status, as the person reads it. */
export const statusLabel: Readonly<Record<Task.Status, string>> = {
  triage: "Triage",
  todo: "To do",
  doing: "Doing",
  held: "Held",
  done: "Done",
  dismissed: "Dismissed"
}

/**
 * How a task's status is drawn: the four drawings `apps/ui` has for triage, to do (open), doing (in progress), and
 * done, and a pause for held and a cross for dismissed, which `apps/ui` has no statuses for.
 */
export const statusShape: Readonly<Record<Task.Status, TaskStatusShape>> = {
  triage: "triage",
  todo: "open",
  doing: "progress",
  held: "paused",
  done: "done",
  dismissed: "dismissed"
}

/** A task's priority, as the person reads it. */
export const priorityLabel: Readonly<Record<Task.Priority, string>> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent"
}
