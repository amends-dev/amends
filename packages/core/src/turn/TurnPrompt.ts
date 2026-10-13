/**
 * What an agent is told of its thread. A turn's prompt is the agent's view of the thread's timeline
 * since its session was last prompted: the thread as it stands, its title and its task, then each
 * activity that told the agent, in its kind's words, as a person reads the same activity in the
 * timeline. The recipient rules decide what tells an agent; this module decides only how each kind
 * reads to one. An agent that joins a thread already under way starts its session with the
 * messages before it joined, as the conversation so far. Everything here is pure: the caller reads
 * the thread and names its people. What the agent is told is text alone, as Effect AI `Prompt`
 * messages, which its session log keeps as it was told.
 *
 * @since 0.1.0
 */

import * as Prompt from "effect/ai/Prompt"
import type * as Identity from "../identity/Identity.ts"
import * as Task from "../task/Task.ts"
import type * as Thread from "../thread/Thread.ts"
import type * as ThreadActivityKind from "../thread/ThreadActivityKind.ts"
import * as ThreadMessage from "../thread/ThreadMessage.ts"
import * as ThreadParticipation from "../thread/ThreadParticipation.ts"
import type * as Member from "../workspace/Member.ts"

/**
 * A message of the thread as the agent is told it, for the conversation it joins.
 *
 * @category models
 * @since 0.1.0
 */
export interface Input {
  /** What the author is called, as the agent is told. */
  readonly author: string
  /** Whether the agent said it. */
  readonly own: boolean
  readonly text: string
}

/**
 * The thread as it stands when a turn starts: its title, and its task when it is one.
 *
 * @category models
 * @since 0.1.0
 */
export interface Context {
  readonly title: Thread.Title | null
  readonly task: Task.Task | undefined
}

/**
 * What the thread's people are called, as the agent is told; the caller reads the names of those
 * `peopleOf` lists.
 *
 * @category models
 * @since 0.1.0
 */
export interface Names {
  readonly member: (memberId: Member.Id) => string
  readonly contact: (contactId: Identity.ContactId) => string
}

/**
 * What a prompt is written with: who the agent is, what people are called, and who asked for the
 * turn to run again, if anyone.
 *
 * @category options
 * @since 0.1.0
 */
export interface Options {
  /** The agent's own membership, which is "you". */
  readonly self: Member.Id
  readonly names: Names
  /** Who asked for the turn to run again, when someone retried it. */
  readonly retriedBy: string | undefined
}

const quoted = (text: string) => `“${text}”`
const memberOf = (memberId: Member.Id): ThreadMessage.Author => ({ _tag: "Member", memberId })
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** What `author` is called: "you" for the agent itself. */
const nameOf = (author: ThreadMessage.Author, options: Options) =>
  ThreadMessage.Author.isAnyOf(["Member"])(author)
    ? author.memberId === options.self
      ? "you"
      : options.names.member(author.memberId)
    : options.names.contact(author.contactId)

/** What a participant is called: a member or contact by name, or triage. */
const participantName = (reference: ThreadParticipation.Reference, options: Options) =>
  ThreadParticipation.Reference.isAnyOf(["Member"])(reference)
    ? nameOf(memberOf(reference.memberId), options)
    : ThreadParticipation.Reference.isAnyOf(["Contact"])(reference)
      ? options.names.contact(reference.contactId)
      : "Triage"

/** A status as it reads: "to do" for `todo`, the word itself otherwise. */
const statusWord = (status: Task.Status) => (status === "todo" ? "to do" : status)

/** A task's state in one phrase: its status, its priority unless none, and who holds it. */
const stateOf = (task: Pick<Task.Task, "status" | "priority" | "assignee">, options: Options): string =>
  [
    `status ${statusWord(task.status)}`,
    ...(task.priority === "none" ? [] : [`priority ${task.priority}`]),
    task.assignee === null ? "unassigned" : `assigned to ${nameOf(memberOf(task.assignee), options)}`
  ].join(", ")

/**
 * The thread as it stands, in a sentence or two: its title, and its task's state when it is one.
 * Nothing for a thread that is neither titled nor a task; its opening message says what it is.
 *
 * @category utils
 * @since 0.1.0
 */
export const contextOf = (context: Context, options: Options): string | undefined => {
  const texts = [
    ...(context.title === null ? [] : [`The thread is titled ${quoted(context.title)}.`]),
    ...(context.task === undefined
      ? []
      : [`${context.title === null ? "This thread" : "It"} is a task: ${stateOf(context.task, options)}.`])
  ]
  return texts.length === 0 ? undefined : texts.join(" ")
}

/** The member an assignee is, when there is one. */
const assigneeOf = (assignee: Member.Id | null): ReadonlyArray<ThreadMessage.Author> =>
  assignee === null ? [] : [memberOf(assignee)]
/** The person a participant is, when it is one: a member or a contact, not triage. */
const personOf = (reference: ThreadParticipation.Reference): ReadonlyArray<ThreadMessage.Author> =>
  ThreadParticipation.Reference.isAnyOf(["Member"])(reference)
    ? [memberOf(reference.memberId)]
    : ThreadParticipation.Reference.isAnyOf(["Contact"])(reference)
      ? [{ _tag: "Contact", contactId: reference.contactId }]
      : []

/** How an agent reads activity of one kind: whom it names, and what it says, if anything. */
interface Reading<Item> {
  readonly people: (item: Item) => ReadonlyArray<ThreadMessage.Author>
  readonly tell: (item: Item, options: Options, toldMessages: Set<ThreadMessage.Id>) => string | undefined
}

/** A kind that tells an agent nothing. */
const untold: Reading<unknown> = { people: () => [], tell: () => undefined }

/**
 * Every kind's reading, as a person reads the same activity in the timeline. A kind without one
 * does not compile: a domain that records a new kind of activity says here how an agent reads it.
 * A message's publication tells its text as it stands; an edit tells the new text unless the
 * publication is told in the same prompt, which `toldMessages` keeps; a deletion is told as such.
 * A turn's changes inform no one, so they are never among what told the agent.
 */
const readings: {
  readonly [K in keyof ThreadActivityKind.Items]: Reading<ThreadActivityKind.Items[K]>
} = {
  "message.published": {
    people: ({ message }) => [message.author],
    tell: ({ message }, options, toldMessages) => {
      if (!ThreadMessage.Content.isAnyOf(["Text"])(message.content)) return undefined
      toldMessages.add(message.id)
      return `${nameOf(message.author, options)}: ${message.content.text}`
    }
  },
  "message.edited": {
    people: ({ message }) => [message.author],
    tell: ({ message }, options, toldMessages) =>
      toldMessages.has(message.id) || !ThreadMessage.Content.isAnyOf(["Text"])(message.content)
        ? undefined
        : `${capitalized(nameOf(message.author, options))} edited their message: ${message.content.text}`
  },
  "message.deleted": {
    people: ({ message }) => [message.author],
    tell: ({ message }, options) => `${capitalized(nameOf(message.author, options))} deleted their message.`
  },
  "thread.renamed": {
    people: () => [],
    tell: ({ activity }) => `The thread was renamed to ${quoted(activity.details.title)}.`
  },
  "participation.followed": {
    people: ({ participant }) => personOf(participant.participant),
    tell: ({ participant }, options) =>
      `${capitalized(participantName(participant.participant, options))} joined the thread.`
  },
  "participation.ended": {
    people: ({ participant }) => personOf(participant.participant),
    tell: ({ participant }, options) =>
      `${capitalized(participantName(participant.participant, options))} left the thread.`
  },
  "task.created": {
    people: ({ activity }) => [activity.details.createdBy, ...assigneeOf(activity.details.assignee)],
    tell: ({ activity }, options) => {
      const { createdBy, ...state } = activity.details
      return `${capitalized(nameOf(createdBy, options))} made this thread a task: ${stateOf(state, options)}.`
    }
  },
  "task.updated": {
    people: ({ activity }) =>
      Task.Change.isAnyOf(["Assignee"])(activity.details) ? assigneeOf(activity.details.to) : [],
    tell: ({ activity }, options) =>
      Task.Change.match(activity.details, {
        Status: ({ to }) => `The task's status is now ${statusWord(to)}.`,
        Priority: ({ to }) =>
          to === "none" ? "The task's priority was cleared." : `The task's priority is now ${to}.`,
        Assignee: ({ to }) =>
          to === null ? "The task was unassigned." : `The task was assigned to ${nameOf(memberOf(to), options)}.`
      })
  },
  "turn.created": untold,
  "turn.started": untold,
  "turn.stopping": untold,
  "turn.ended": untold
}

/** The reading of an item, by its activity's kind. */
const readingOf = (item: Thread.TimelineItem) => readings[item.activity.kind] as Reading<Thread.TimelineItem>

/** Whether an item is a message's publication; its kind is within its activity, so this narrows it. */
const isPublished = (item: Thread.TimelineItem): item is ThreadActivityKind.Items["message.published"] =>
  item.activity.kind === "message.published"

/**
 * Everyone the items and the context name, for the caller to read what they are called.
 *
 * @category utils
 * @since 0.1.0
 */
export const peopleOf = (
  context: Context,
  items: ReadonlyArray<Thread.TimelineItem>
): ReadonlyArray<ThreadMessage.Author> => [
  ...(context.task === undefined ? [] : assigneeOf(context.task.assignee)),
  ...items.flatMap((item) => readingOf(item).people(item))
]

/**
 * A turn's prompt: one user message with the thread as it stands first, then a text for each item
 * that told the agent something, and one for who asked the turn to run again, when someone retried
 * it. Nothing when it has nothing to say; the context alone says nothing.
 *
 * @category constructors
 * @since 0.1.0
 */
export const promptOf = (
  context: Context,
  items: ReadonlyArray<Thread.TimelineItem>,
  options: Options
): Prompt.UserMessage | undefined => {
  const toldMessages = new Set<ThreadMessage.Id>()
  const texts: Array<string> = []
  for (const item of items) {
    const text = readingOf(item).tell(item, options, toldMessages)
    if (text !== undefined) texts.push(text)
  }
  if (options.retriedBy !== undefined) texts.push(`${options.retriedBy} asked you to try that again.`)
  if (texts.length === 0) return undefined
  const header = contextOf(context, options)
  return userMessageOf(header === undefined ? texts : [header, ...texts])
}

/**
 * How many of the thread's messages the items tell: those published that still have text.
 *
 * @category utils
 * @since 0.1.0
 */
export const countMessages = (items: ReadonlyArray<Thread.TimelineItem>) =>
  items.filter((item) => isPublished(item) && ThreadMessage.Content.isAnyOf(["Text"])(item.message.content)).length

/** One message's text as the agent is told it: named by its author. */
const named = (input: Input) => `${input.author}: ${input.text}`

/**
 * The conversation an agent's session starts with when it joins a thread under way: others'
 * messages as the user's, each named by its author, and its own, from an earlier time it took
 * part, as its answers. Consecutive messages of one side make one message, as models take a
 * conversation whose sides alternate.
 *
 * @category constructors
 * @since 0.1.0
 */
export const conversationOf = (messages: ReadonlyArray<Input>): ReadonlyArray<Prompt.Message> => {
  const conversation: Array<Prompt.Message> = []
  let run: Array<Input> = []
  const endRun = () => {
    const [first, ...rest] = run
    if (first === undefined) return
    conversation.push(
      first.own
        ? assistantMessageOf([first.text, ...rest.map((input) => input.text)])
        : userMessageOf([named(first), ...rest.map(named)])
    )
    run = []
  }
  for (const input of messages) {
    if (run[0] !== undefined && run[0].own !== input.own) endRun()
    run.push(input)
  }
  endRun()
  return conversation
}

const textParts = (texts: ReadonlyArray<string>) => texts.map((text) => Prompt.makePart("text", { text }))

/** What the agent is told, as the user's message, each text one part. */
const userMessageOf = (texts: ReadonlyArray<string>): Prompt.UserMessage =>
  Prompt.makeMessage("user", { content: textParts(texts) })

/** What the agent said, as its answer, each text one part. */
const assistantMessageOf = (texts: ReadonlyArray<string>): Prompt.AssistantMessage =>
  Prompt.makeMessage("assistant", { content: textParts(texts) })
