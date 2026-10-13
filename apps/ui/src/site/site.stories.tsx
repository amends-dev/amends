import { For } from "solid-js"
import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { expect, within } from "storybook/test"
import { ButtonLink } from "../components/button/index.ts"
import "./fonts.ts"
import {
  AppPreview,
  CodeWindow,
  Command,
  FeatureArt,
  FeatureCard,
  Hero,
  PackageCard,
  PackageDiagram,
  Section,
  SiteFooter,
  SiteHeader,
  Steps,
  type FeatureArtKind
} from "./index.ts"

const meta = {
  title: "Site/Sections",
  parameters: { layout: "fullscreen" as const }
} satisfies Meta
export default meta
type Story = StoryObj

const github = "https://github.com/amends-dev/amends"

function Header(props: { current?: "packages" | "docs" }) {
  return (
    <SiteHeader.Root>
      <SiteHeader.Brand href="/" />
      <SiteHeader.Links>
        <SiteHeader.Link href="/packages" current={props.current === "packages"}>
          Packages
        </SiteHeader.Link>
        <SiteHeader.Link href="/docs" current={props.current === "docs"}>
          Docs
        </SiteHeader.Link>
        <SiteHeader.Link href={github}>GitHub</SiteHeader.Link>
      </SiteHeader.Links>
      <SiteHeader.Action href="/docs/self-host">Self-host</SiteHeader.Action>
    </SiteHeader.Root>
  )
}

function Footer() {
  return (
    <SiteFooter.Root tagline="Where people and agents work together." legal="Released under the MIT license.">
      <SiteFooter.Column title="Product">
        <SiteFooter.Link href="/docs/self-host">Self-host</SiteFooter.Link>
      </SiteFooter.Column>
      <SiteFooter.Column title="Developers">
        <SiteFooter.Link href="/packages">Packages</SiteFooter.Link>
        <SiteFooter.Link href="/docs">Docs</SiteFooter.Link>
      </SiteFooter.Column>
      <SiteFooter.Column title="Project">
        <SiteFooter.Link href={github}>GitHub</SiteFooter.Link>
        <SiteFooter.Link href={`${github}/blob/main/LICENSE`}>License</SiteFooter.Link>
      </SiteFooter.Column>
    </SiteFooter.Root>
  )
}

const features: ReadonlyArray<{ kind: FeatureArtKind; title: string; text: string }> = [
  {
    kind: "threads",
    title: "Threads",
    text: "Talk in groups and direct messages. Replies stay in their thread, and the inbox gathers what needs you."
  },
  {
    kind: "tasks",
    title: "Tasks",
    text: "Any thread can become a task, with a status, a priority, and an assignee: a person or an agent."
  },
  {
    kind: "agents",
    title: "Agents",
    text: "Mention an agent and it takes a turn in the thread, then posts its answer."
  },
  {
    kind: "connections",
    title: "Connections",
    text: "Connect the models, sandboxes, agents, and tools your workspace uses."
  }
]

// No import lines: the package boundary check reads them as this file's own imports.
const code = `const program = Effect.gen(function* () {
  const harness = Harness.make(agent);
  const session = yield* harness.createSession({ id });
  const answer = yield* session.generate({ prompt: "Say hello" });
  return answer.text;
});`

/** The home page's sections in order, as the site composes them. */
export const Home = {
  render: () => (
    <>
      <Header />
      <Hero.Root>
        <Hero.Text>
          <Hero.Badge>Open source · MIT license</Hero.Badge>
          <Hero.Title>Where people and agents work together</Hero.Title>
          <Hero.Lead>
            Conversations live in threads, work becomes tasks, and agents take turns when a thread needs them.
          </Hero.Lead>
          <Hero.Actions centered>
            <ButtonLink href="/docs/self-host" variant="primary" size="large">
              Self-host amends
            </ButtonLink>
            <Hero.Soon label="amends Cloud" />
          </Hero.Actions>
        </Hero.Text>
        <Hero.Preview>
          <AppPreview label="The amends app: an agent answers a question in a thread." />
        </Hero.Preview>
      </Hero.Root>
      <Section.Root tone="canvas">
        <Section.Header layout="split">
          <Section.Heading>
            <Section.Eyebrow>The workspace</Section.Eyebrow>
            <Section.Title>Threads hold the work. Agents take turns in them.</Section.Title>
          </Section.Heading>
          <Section.Intro>Agents are members like anyone else.</Section.Intro>
        </Section.Header>
        <Section.Grid columns={4}>
          <For each={features}>
            {(feature) => (
              <li>
                <FeatureCard.Root>
                  <FeatureCard.Art>
                    <FeatureArt kind={feature.kind} />
                  </FeatureCard.Art>
                  <FeatureCard.Title>{feature.title}</FeatureCard.Title>
                  <FeatureCard.Text>{feature.text}</FeatureCard.Text>
                </FeatureCard.Root>
              </li>
            )}
          </For>
        </Section.Grid>
      </Section.Root>
      <Section.Root tone="inverse">
        <Section.Split>
          <Section.Part>
            <Section.Header>
              <Section.Eyebrow>For developers</Section.Eyebrow>
              <Section.Title>Built from open parts</Section.Title>
              <Section.Intro>Packages of their own on npm, built on Effect.</Section.Intro>
            </Section.Header>
            <Section.Rows>
              <Section.Row term="@amends-dev/harness">Runs an agent and streams its turns.</Section.Row>
              <Section.Row term="@amends-dev/sandbox">The contract every sandbox implements.</Section.Row>
            </Section.Rows>
            <Section.Actions>
              <ButtonLink href="/packages" variant="primary" size="large">
                Browse packages
              </ButtonLink>
            </Section.Actions>
          </Section.Part>
          <Section.Part>
            <CodeWindow title="hello.ts" code={code} />
          </Section.Part>
        </Section.Split>
      </Section.Root>
      <Section.Root>
        <Section.Split>
          <Section.Part>
            <Section.Header>
              <Section.Eyebrow>Self-host</Section.Eyebrow>
              <Section.Title>Run it yourself</Section.Title>
            </Section.Header>
            <Section.Note title="amends Cloud" badge="Coming soon">
              amends, hosted for you by the team that builds it.
            </Section.Note>
          </Section.Part>
          <Section.Part>
            <CodeWindow title="Terminal" code={"$ bun install\n$ bun run start"} />
          </Section.Part>
        </Section.Split>
      </Section.Root>
      <Footer />
    </>
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await expect(page.getAllByRole("heading", { level: 1 })[0]).toHaveTextContent(
      "Where people and agents work together"
    )
    await expect(page.getAllByRole("img", { name: /an agent answers a question/ })[0]).toBeInTheDocument()
    await expect(page.getAllByRole("link", { name: "Packages" })[0]).toBeInTheDocument()
  }
} satisfies Story

/** The packages page's headline, a contract's and an adapter's card, and the steps. */
export const Packages = {
  render: () => (
    <>
      <Header current="packages" />
      <Hero.Root layout="split">
        <Hero.Text>
          <Hero.Badge>Packages</Hero.Badge>
          <Hero.Title size="page">The parts amends runs agents with</Hero.Title>
          <Hero.Lead>Run any agent in any sandbox from your own Effect program.</Hero.Lead>
          <Command command="bun add @amends-dev/harness @amends-dev/sandbox" />
        </Hero.Text>
        <Hero.Aside>
          <PackageDiagram
            program="Your Effect program"
            contracts={[
              { name: "@amends-dev/harness", adapters: ["harness-amends", "harness-opencode"] },
              { name: "@amends-dev/sandbox", adapters: ["sandbox-local", "sandbox-daytona"] }
            ]}
          />
        </Hero.Aside>
      </Hero.Root>
      <Section.Root>
        <Section.Header>
          <Section.Title size="heading">Contracts</Section.Title>
        </Section.Header>
        <Section.Grid columns={3}>
          <For each={["harness", "sandbox", "channel"]}>
            {(name) => (
              <li>
                <PackageCard.Root name={`@amends-dev/${name}`} kind="Contract" version="0.1.0">
                  <PackageCard.Description>What every implementation agrees on.</PackageCard.Description>
                  <PackageCard.Links>
                    <PackageCard.Link href={`/docs/packages/${name}`}>Docs</PackageCard.Link>
                    <PackageCard.Link href={`https://www.npmjs.com/package/@amends-dev/${name}`}>npm</PackageCard.Link>
                  </PackageCard.Links>
                </PackageCard.Root>
              </li>
            )}
          </For>
        </Section.Grid>
      </Section.Root>
      <Section.Root tone="canvas">
        <Section.Split>
          <Section.Part>
            <Steps.Root>
              <Steps.Step title="Make an agent">From an adapter.</Steps.Step>
              <Steps.Step title="Run it with a harness">Sessions and turns in one format.</Steps.Step>
            </Steps.Root>
          </Section.Part>
          <Section.Part>
            <CodeWindow title="hello.ts" code={code} />
          </Section.Part>
        </Section.Split>
      </Section.Root>
      <Footer />
    </>
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await expect(page.getAllByRole("link", { name: "Packages" })[0]).toHaveAttribute("aria-current", "page")
    await expect(page.getAllByRole("list", { name: "Implementations of @amends-dev/harness" })[0]).toHaveTextContent(
      "harness-amendsharness-opencode"
    )
  }
} satisfies Story
