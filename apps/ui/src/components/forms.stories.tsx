import { IconMarkNew } from "@amends-dev/icons"
import { createSignal } from "solid-js"
import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { expect, userEvent, within } from "storybook/test"
import { Button } from "./button/index.ts"
import { Choice } from "./choice/index.ts"
import { Combobox } from "./combobox/index.ts"
import * as s from "./components.stories.css.ts"
import { Field } from "./field/index.ts"
import { FormFields, type FormField, type FormIssue } from "./form-fields/index.ts"
import { Input, SearchField } from "./input/index.ts"
import { MemberPicker } from "./member-picker/index.ts"
import { Menu } from "./menu/index.ts"
import { Notice } from "./notice/index.ts"
import { Select } from "./select/index.ts"

const meta = { title: "Components/Forms" } satisfies Meta
export default meta
type Story = StoryObj

export const Buttons = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Button</h2>
        <p class={s.note}>
          Primary for the one main action, secondary for the rest, and quiet for row actions. Disabled buttons fill with
          the subtle shade. Below 64rem they are 44px tall.
        </p>
        <div class={s.panel}>
          <Button variant="primary">Save changes</Button>
          <Button variant="primary" disabled>
            Save changes
          </Button>
          <Button>Cancel</Button>
          <Button icon={IconMarkNew}>New task</Button>
          <Button chevron>Status</Button>
          <Button disabled>Add</Button>
          <Button variant="quiet">Remove</Button>
        </div>
      </section>
    </div>
  )
} satisfies Story

function FieldsExample() {
  const [name, setName] = createSignal("general")
  const [visibility, setVisibility] = createSignal("private")
  const [status, setStatus] = createSignal("all")
  const [selected, setSelected] = createSignal<Array<string>>([])
  return (
    <div class={s.stack}>
      <Field.Root
        hint="Everyone in this group sees this name."
        error={name().trim() ? undefined : "Give the group a name."}
      >
        <Field.Label>Group name</Field.Label>
        <Input value={name()} onInput={(event) => setName(event.currentTarget.value)} />
      </Field.Root>
      <Choice.Group
        label="Visibility"
        value={visibility()}
        onChange={setVisibility}
        hint={
          visibility() === "public"
            ? "Anyone in the workspace can find this group and join it."
            : "Only people added to this group can find it."
        }
      >
        <Choice.Option value="public">Public</Choice.Option>
        <Choice.Option value="private">Private</Choice.Option>
      </Choice.Group>
      <div class={s.panel}>
        <SearchField placeholder="Search tasks…" />
        <Menu.Root>
          <Menu.Trigger>{status() === "all" ? "Status" : status()}</Menu.Trigger>
          <Menu.Content aria-label="Filter by status">
            <Menu.RadioGroup value={status()} onChange={setStatus}>
              <Menu.RadioItem value="all">Any status</Menu.RadioItem>
              <Menu.RadioItem value="Open">Open</Menu.RadioItem>
              <Menu.RadioItem value="Done">Done</Menu.RadioItem>
            </Menu.RadioGroup>
          </Menu.Content>
        </Menu.Root>
      </div>
      <Field.Root>
        <Field.Label>Add members</Field.Label>
        <MemberPicker
          candidates={[
            { id: "casey", name: "Casey Park", tone: "sage", kind: "Person" },
            { id: "morgan", name: "Morgan Lee", tone: "slate", kind: "Person" },
            { id: "yumi", name: "Yumi", tone: "lilac", kind: "Agent" }
          ]}
          selected={selected()}
          onSelectedChange={setSelected}
        />
      </Field.Root>
    </div>
  )
}

export const Fields = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Fields, choices, search, menus, and the member picker</h2>
        <FieldsExample />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const name = canvas.getByRole("textbox", { name: "Group name" })
    await expect(name).toHaveAccessibleDescription("Everyone in this group sees this name.")
    await userEvent.clear(name)
    await expect(name).toHaveAttribute("aria-invalid", "true")
    await userEvent.click(canvas.getByRole("radio", { name: "Public" }))
    await expect(canvas.getByText(/can find this group and join it/)).toBeVisible()
    const picker = canvas.getByRole("combobox", { name: "Add members" })
    await userEvent.type(picker, "yu{Enter}")
    await expect(canvas.getByRole("button", { name: "Remove Yumi" })).toBeVisible()
    await userEvent.type(picker, "{Backspace}")
    await expect(canvas.queryByRole("button", { name: "Remove Yumi" })).toBeNull()
  }
} satisfies Story

const settingsFields: ReadonlyArray<FormField> = [
  {
    key: "url",
    label: "Server URL",
    description: "Where the MCP server answers over Streamable HTTP.",
    required: true,
    kind: "text",
    format: "uri"
  },
  {
    key: "keyHeader",
    label: "Key header",
    description: "The header the API key goes in. Without one, it goes in Authorization.",
    required: false,
    kind: "text",
    maxLength: 64
  },
  {
    key: "contextWindow",
    label: "Context window",
    required: false,
    kind: "number",
    integer: true,
    minimum: 1
  },
  {
    key: "region",
    label: "Region",
    required: false,
    kind: "choice",
    options: [
      { value: "us", label: "United States" },
      { value: "eu", label: "Europe" }
    ]
  },
  { key: "streaming", label: "Stream responses", required: true, kind: "boolean" }
]

/** What the story's fields refuse, as the app's client would tell it. */
const settingsIssue = (field: FormField, value: string): FormIssue | undefined => {
  if (value.trim() === "") return undefined
  if (field.kind === "text" && field.format === "uri" && !URL.canParse(value)) return "format"
  if (field.kind === "text" && field.maxLength !== undefined && value.length > field.maxLength) return "length"
  if (field.kind === "number" && field.integer && !/^-?\d+$/.test(value)) return "format"
  if (field.kind === "number" && field.minimum !== undefined && Number(value) < field.minimum) return "range"
  return undefined
}

function SettingsExample() {
  const [values, setValues] = createSignal<Readonly<Record<string, string>>>({
    url: "https://tools.example.com/mcp",
    streaming: "true"
  })
  const field = (key: string) => settingsFields.find((candidate) => candidate.key === key)
  return (
    <div class={s.stack}>
      <FormFields
        fields={settingsFields}
        value={(key) => values()[key] ?? ""}
        onChange={(key, value) => setValues({ ...values(), [key]: value })}
        issue={(key) => {
          const described = field(key)
          return described && settingsIssue(described, values()[key] ?? "")
        }}
      />
    </div>
  )
}

/**
 * A form's fields described as data, such as an integration's settings: text of a format, a
 * number with bounds, one of a few options, and yes or no, each saying what it refuses.
 */
export const SettingsFields = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Fields from a description</h2>
        <SettingsExample />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const url = canvas.getByRole("textbox", { name: "Server URL" })
    await expect(url).toHaveAccessibleDescription("Where the MCP server answers over Streamable HTTP.")
    await userEvent.clear(url)
    await userEvent.type(url, "tools.example.com")
    await expect(url).toHaveAttribute("aria-invalid", "true")
    await expect(canvas.getByText("Enter a full address, such as https://example.com.")).toBeVisible()
    const window = canvas.getByRole("spinbutton", { name: "Context window · Optional" })
    await userEvent.type(window, "0")
    await expect(canvas.getByText("Enter a whole number of at least 1.")).toBeVisible()
    await userEvent.click(canvas.getByRole("radio", { name: "No" }))
    await expect(canvas.getByRole("radio", { name: "No" })).toBeChecked()
    await expect(canvas.getByText("Not set")).toBeVisible()
  }
} satisfies Story

/**
 * Notices from the Lunacy "Status v01" board: caution for what needs setup, danger for what cannot
 * work, each with its mark, and at most one action that fixes it.
 */
export const Notices = {
  render: () => {
    const [opened, setOpened] = createSignal(0)
    return (
      <div class={s.page}>
        <section class={s.section}>
          <h2 class={s.heading}>Notices</h2>
          <Notice title="API key wasn’t saved" alert>
            Credential storage is unavailable. Ask your administrator to enable it, then try again.
          </Notice>
          <Notice
            title="Anthropic · Backup needs an API key before this agent can run."
            action={{ label: "Open connection", onClick: () => setOpened((count) => count + 1) }}
          />
          <Notice tone="danger" title="This harness doesn’t support the connection’s provider." />
          <p class={s.note}>Opened {opened()} times</p>
        </section>
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("alert")).toHaveTextContent("API key wasn’t saved")
    await userEvent.click(canvas.getByRole("button", { name: "Open connection" }))
    await expect(canvas.getByText("Opened 1 times")).toBeVisible()
  }
} satisfies Story

function CardChoiceExample() {
  const [where, setWhere] = createSignal("none")
  const [account, setAccount] = createSignal<string | undefined>("team")
  const [created, setCreated] = createSignal(0)
  return (
    <div class={s.stack}>
      <Choice.Group label="Sandbox" value={where()} onChange={setWhere} variant="card">
        <Choice.Option value="none" description="Run without a sandbox.">
          No sandbox
        </Choice.Option>
        <Choice.Option value="local" description="Runs on this host without isolation.">
          Local directory
        </Choice.Option>
        <Choice.Option value="daytona" description="Isolated containers in your Daytona account.">
          Daytona
        </Choice.Option>
      </Choice.Group>
      <Field.Root hint={`Created ${created()} from the list`}>
        <Field.Label>Daytona account</Field.Label>
        <Select
          options={[
            { value: "team", label: "Daytona · Team" },
            {
              value: "backup",
              label: "Daytona · Backup",
              description: "Needs API key · Can finish setup later",
              status: { mark: "attention", label: "Needs setup" }
            }
          ]}
          value={account()}
          onChange={setAccount}
          action={{ label: "Create Daytona connection", onSelect: () => setCreated(created() + 1) }}
        />
      </Field.Root>
    </div>
  )
}

/**
 * Card choices from the Lunacy "Environments / 05" frame, and a select whose options carry a
 * second line and whose list ends with an action, from "Environments / 10".
 */
export const CardsAndDetailedSelect = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Card choices and a select with details</h2>
        <CardChoiceExample />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("radio", { name: /Daytona/ }))
    await expect(canvas.getByRole("radio", { name: /Daytona/ })).toBeChecked()
    await userEvent.click(canvas.getByRole("button", { name: /Daytona account/ }))
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole("option", { name: /Daytona · Backup/ })).toHaveTextContent("Needs API key")
    await userEvent.click(body.getByRole("button", { name: "Create Daytona connection" }))
    await expect(canvas.getByText("Created 1 from the list")).toBeVisible()
  }
} satisfies Story

function ModelFieldsExample() {
  const [model, setModel] = createSignal("claude-sonnet-5")
  const [environment, setEnvironment] = createSignal("remote")
  return (
    <div class={s.stack}>
      <Field.Root hint="Choose a suggestion or enter a model ID.">
        <Field.Label>Model</Field.Label>
        <Combobox
          value={model()}
          onChange={setModel}
          heading="Suggested models"
          footer="Or enter another model ID."
          custom={{
            label: (text) => `Use “${text}”`,
            description: "Use this model ID as entered."
          }}
          suggestions={[
            { value: "claude-opus-5-5", label: "Claude Opus 5.5" },
            { value: "claude-sonnet-5", label: "Claude Sonnet 5" },
            { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" }
          ]}
        />
      </Field.Root>
      <p class={s.note}>Model: {model()}</p>
      <Field.Root>
        <Field.Label>Environment</Field.Label>
        <Select
          heading="For this model"
          options={[
            {
              value: "in-process",
              label: "In-process",
              description: "Amends · No sandbox",
              status: { mark: "available", label: "Works" }
            },
            {
              value: "remote",
              label: "Remote development",
              description: "Amends · Daytona",
              status: { mark: "available", label: "Works" }
            },
            {
              value: "review",
              label: "Review sandbox",
              description: "Amends · Daytona",
              detail: "Daytona account needs its API key.",
              status: { mark: "attention", label: "Needs setup" }
            },
            {
              value: "boxed",
              label: "Boxed",
              description: "The harness doesn’t support this connection’s model provider.",
              status: { mark: "blocked", label: "Can’t run this model" },
              disabled: true
            }
          ]}
          value={environment()}
          onChange={setEnvironment}
        />
      </Field.Root>
    </div>
  )
}

/**
 * A combobox of suggestions that also keeps any text, from the Lunacy "Agents / 12" and "13"
 * frames, and a select whose options carry a status, a reason, and may be unavailable, from
 * "Agents / 14" and the selection states.
 */
export const SuggestionsAndStatuses = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Suggestions and option statuses</h2>
        <ModelFieldsExample />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const model = canvas.getByRole("combobox", { name: "Model" })
    await userEvent.click(canvas.getByRole("button", { name: "Show suggestions" }))
    await expect(await body.findByRole("option", { name: /Claude Opus 5.5/ })).toBeVisible()
    await userEvent.click(body.getByRole("option", { name: /Claude Opus 5.5/ }))
    await expect(model).toHaveValue("claude-opus-5-5")
    await userEvent.clear(model)
    await userEvent.type(model, "my-model-alias")
    await expect(await body.findByRole("option", { name: /Use “my-model-alias”/ })).toBeVisible()
    await userEvent.keyboard("{Enter}")
    await expect(canvas.getByText("Model: my-model-alias")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: /Environment/ }))
    const review = await body.findByRole("option", { name: /Review sandbox/ })
    await expect(within(review).getByRole("img", { name: "Needs setup" })).toBeVisible()
    await expect(review).toHaveTextContent("Daytona account needs its API key.")
    await expect(body.getByRole("option", { name: /Boxed/ })).toHaveAttribute("aria-disabled", "true")
  }
} satisfies Story
