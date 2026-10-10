/** The packages page: every published package, how they fit, and how to start with them. */
import { For } from "solid-js";
import { ButtonLink } from "@amends-dev/ui/components/button";
import {
  CodeWindow,
  Command,
  FeatureCard,
  Hero,
  PackageCard,
  PackageDiagram,
  Section,
  Steps,
} from "@amends-dev/ui/site";
import { adapters, adaptersOf, contracts, links, type PublishedPackage } from "./catalog.ts";
import { quickStart } from "./examples.ts";
import { Footer, Header } from "./site.tsx";

const writeYourOwn = [
  {
    title: "An agent",
    text: "Implement the harness contract, and every host runs your agent's turns in the same stream.",
    link: "Writing an adapter →",
    href: "/docs/packages/harness/#writing-an-adapter",
  },
  {
    title: "A sandbox provider",
    text: "Implement the sandbox contract, then run its conformance suites against your provider.",
    link: "Writing a provider →",
    href: "/docs/packages/sandbox/#writing-a-provider",
  },
  {
    title: "A channel",
    text: "Implement the channel transport contract to bring one system's conversations in.",
    link: "Writing a transport →",
    href: "/docs/packages/channel/#writing-a-transport",
  },
];

function Card(props: { pkg: PublishedPackage }) {
  const kind = () =>
    props.pkg.implements === undefined ? "Contract" : `Implements ${props.pkg.implements}`;
  return (
    <li>
      <PackageCard.Root name={props.pkg.name} kind={kind()} version={props.pkg.version}>
        <PackageCard.Description>{props.pkg.description}</PackageCard.Description>
        <PackageCard.Links>
          <PackageCard.Link href={links(props.pkg).guide}>Guide</PackageCard.Link>
          <PackageCard.Link href={links(props.pkg).reference}>API</PackageCard.Link>
          <PackageCard.Link href={links(props.pkg).npm}>npm</PackageCard.Link>
          <PackageCard.Link href={links(props.pkg).source}>Source</PackageCard.Link>
        </PackageCard.Links>
      </PackageCard.Root>
    </li>
  );
}

export function Packages() {
  const diagram = contracts
    .map((contract) => ({
      name: contract.name,
      adapters: adaptersOf(contract).map((adapter) => adapter.short),
    }))
    .filter((contract) => contract.adapters.length > 0);
  return (
    <>
      <Header current="packages" />
      <main>
        <Hero.Root layout="split">
          <Hero.Text>
            <Hero.Badge>Packages</Hero.Badge>
            <Hero.Title size="page">The parts amends runs agents with</Hero.Title>
            <Hero.Lead>
              Run any agent in any sandbox from your own Effect program. Contracts say what every
              implementation agrees on, and each adapter implements one over one system.
            </Hero.Lead>
            <Command command="bun add @amends-dev/harness @amends-dev/sandbox" />
            <Hero.Actions>
              <ButtonLink href="/docs/" variant="primary" size="large">
                Read the docs
              </ButtonLink>
            </Hero.Actions>
          </Hero.Text>
          <Hero.Aside>
            <PackageDiagram program="Your Effect program" contracts={diagram} />
          </Hero.Aside>
        </Hero.Root>

        <Section.Root>
          <Section.Header>
            <Section.Title size="heading">Contracts</Section.Title>
            <Section.Intro>
              What every implementation agrees on. Depend on a contract, and choose the adapter
              behind it when the program runs.
            </Section.Intro>
          </Section.Header>
          <Section.Grid columns={3}>
            <For each={contracts}>{(pkg) => <Card pkg={pkg} />}</For>
          </Section.Grid>
          <Section.Header>
            <Section.Title size="heading">Adapters</Section.Title>
            <Section.Intro>
              Each implements one contract over one system, with only that system's dependencies.
            </Section.Intro>
          </Section.Header>
          <Section.Grid columns={4}>
            <For each={adapters}>{(pkg) => <Card pkg={pkg} />}</For>
          </Section.Grid>
        </Section.Root>

        <Section.Root tone="canvas">
          <Section.Split wider="end">
            <Section.Part>
              <Section.Header>
                <Section.Eyebrow>Quick start</Section.Eyebrow>
                <Section.Title size="heading">An agent in a few lines</Section.Title>
              </Section.Header>
              <Steps.Root>
                <Steps.Step title="Make an agent">
                  From an adapter: amends's own agent over an Effect AI model, or opencode in a
                  sandbox.
                </Steps.Step>
                <Steps.Step title="Run it with a harness">
                  Every agent gets the same sessions and turns, streamed in one format.
                </Steps.Step>
                <Steps.Step title="Keep the session">
                  Release a session as JSON and resume it later, on any host and on any agent.
                </Steps.Step>
              </Steps.Root>
            </Section.Part>
            <Section.Part>
              <CodeWindow title="hello.ts" code={quickStart("adapters/harness-amends")} />
            </Section.Part>
          </Section.Split>
        </Section.Root>

        <Section.Root>
          <Section.Header>
            <Section.Title size="heading">Write your own</Section.Title>
            <Section.Intro>
              An integration connects amends to another system. Each kind has a contract, and each
              implementation is a package of its own.
            </Section.Intro>
          </Section.Header>
          <Section.Grid columns={3}>
            <For each={writeYourOwn}>
              {(item) => (
                <li>
                  <FeatureCard.Root>
                    <FeatureCard.Title>{item.title}</FeatureCard.Title>
                    <FeatureCard.Text>{item.text}</FeatureCard.Text>
                    <FeatureCard.Link href={item.href}>{item.link}</FeatureCard.Link>
                  </FeatureCard.Root>
                </li>
              )}
            </For>
          </Section.Grid>
        </Section.Root>
      </main>
      <Footer />
    </>
  );
}
