/** The home page: the app first, then the packages it is built from, then how to run it. */
import { For } from "solid-js";
import { ButtonLink } from "@amends-dev/ui/components/button";
import {
  AppPreview,
  CodeWindow,
  FeatureArt,
  FeatureCard,
  Hero,
  Section,
  type FeatureArtKind,
} from "@amends-dev/ui/site";
import { contracts, repository } from "./catalog.ts";
import { docExample } from "./examples.ts";
import { Footer, Header, selfHost } from "./site.tsx";

const features: ReadonlyArray<{ kind: FeatureArtKind; title: string; text: string }> = [
  {
    kind: "threads",
    title: "Threads",
    text: "Talk in groups and direct messages. Replies stay in their thread, and the inbox gathers what needs you.",
  },
  {
    kind: "tasks",
    title: "Tasks",
    text: "Any thread can become a task, with a status, a priority, and an assignee: a person or an agent.",
  },
  {
    kind: "agents",
    title: "Agents",
    text: "Mention an agent and it takes a turn in the thread, then posts its answer with a log of what it did.",
  },
  {
    kind: "connections",
    title: "Connections",
    text: "Connect the models, sandboxes, agents, and tools your workspace uses. Credentials stay sealed on your host.",
  },
];

const terminal = `$ git clone ${repository}
$ cd amends && bun install
$ createdb amends
$ AMENDS_DATABASE_URL=postgresql://localhost/amends \\
    bun run start
Listening on http://127.0.0.1:8787

# In another terminal, start the web app
$ bun run --filter @amends-dev/web dev`;

export function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero.Root>
          <Hero.Text>
            <Hero.Badge>Open source · MIT license</Hero.Badge>
            <Hero.Title>Where people and agents work together</Hero.Title>
            <Hero.Lead>
              Conversations live in threads, work becomes tasks, and agents take turns when a thread
              needs them, on the models and sandboxes you connect.
            </Hero.Lead>
            <Hero.Actions centered>
              <ButtonLink href={selfHost} variant="primary" size="large">
                Self-host amends
              </ButtonLink>
              <Hero.Soon label="amends Cloud" />
            </Hero.Actions>
          </Hero.Text>
          <Hero.Preview>
            <AppPreview label="The amends app: in the general group, the agent Yumi answers AJ's question about the rollout plan in a thread." />
          </Hero.Preview>
        </Hero.Root>

        <Section.Root tone="canvas">
          <Section.Header layout="split">
            <Section.Heading>
              <Section.Eyebrow>The workspace</Section.Eyebrow>
              <Section.Title>Threads hold the work. Agents take turns in them.</Section.Title>
            </Section.Heading>
            <Section.Intro>
              amends is a workspace for teams and the agents they work with. Agents are members like
              anyone else, each running on the agent, model, and sandbox your workspace connects.
            </Section.Intro>
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
          <Section.Split wider="end">
            <Section.Part>
              <Section.Header>
                <Section.Eyebrow>For developers</Section.Eyebrow>
                <Section.Title>Built from open parts</Section.Title>
                <Section.Intro>
                  The parts amends runs agents with are packages of their own on npm, built on
                  Effect. Use them in any Effect program, not only in amends.
                </Section.Intro>
              </Section.Header>
              <Section.Rows>
                <For each={contracts}>
                  {(contract) => (
                    <Section.Row term={contract.name}>{contract.description}</Section.Row>
                  )}
                </For>
              </Section.Rows>
              <Section.Actions>
                <ButtonLink href="/packages/" variant="primary" size="large">
                  Browse packages
                </ButtonLink>
                <ButtonLink href="/docs/" size="large">
                  Read the docs
                </ButtonLink>
              </Section.Actions>
            </Section.Part>
            <Section.Part>
              <CodeWindow
                title="chat.ts"
                code={docExample(
                  "packages/harness/src/Harness.ts",
                  "Providing the harness to a program",
                )}
              />
            </Section.Part>
          </Section.Split>
        </Section.Root>

        <Section.Root>
          <Section.Split>
            <Section.Part>
              <Section.Header>
                <Section.Eyebrow>Self-host</Section.Eyebrow>
                <Section.Title>Run it yourself</Section.Title>
                <Section.Intro>
                  amends is open source under the MIT license and in early development. Today it
                  runs on your machine with Bun and PostgreSQL, on the models and sandboxes you
                  connect.
                </Section.Intro>
              </Section.Header>
              <Section.Actions>
                <ButtonLink href={selfHost} variant="primary" size="large">
                  Self-hosting guide
                </ButtonLink>
                <ButtonLink href={repository} size="large">
                  View on GitHub
                </ButtonLink>
              </Section.Actions>
              <Section.Note title="amends Cloud" badge="Coming soon">
                amends, hosted for you by the team that builds it.
              </Section.Note>
            </Section.Part>
            <Section.Part>
              <CodeWindow title="Terminal" code={terminal} />
            </Section.Part>
          </Section.Split>
        </Section.Root>
      </main>
      <Footer />
    </>
  );
}
