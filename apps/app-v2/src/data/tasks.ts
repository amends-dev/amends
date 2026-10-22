/** Shared task state decisions. */

import type { Task } from "@amends-dev/core/task"

/** Whether a task in `status` is open: it is neither done nor dismissed. */
export const isOpen = (status: Task.Status): boolean => status !== "done" && status !== "dismissed"
