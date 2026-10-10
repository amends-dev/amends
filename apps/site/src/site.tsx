/** The header and footer every page of the site shares, with the site's own links. */
import { SiteFooter, SiteHeader } from "@amends-dev/ui/site";
import { repository } from "./catalog.ts";

export const selfHost = "/docs/self-host/";

export function Header(props: { current?: "packages" }) {
  return (
    <SiteHeader.Root>
      <SiteHeader.Brand href="/" />
      <SiteHeader.Links>
        <SiteHeader.Link href="/packages/" current={props.current === "packages"}>
          Packages
        </SiteHeader.Link>
        <SiteHeader.Link href="/docs/">Docs</SiteHeader.Link>
        <SiteHeader.Link href={repository}>GitHub</SiteHeader.Link>
      </SiteHeader.Links>
      <SiteHeader.Action href={selfHost}>Self-host</SiteHeader.Action>
    </SiteHeader.Root>
  );
}

export function Footer() {
  return (
    <SiteFooter.Root
      tagline="Where people and agents work together."
      legal="Released under the MIT license."
    >
      <SiteFooter.Column title="Product">
        <SiteFooter.Link href={selfHost}>Self-host</SiteFooter.Link>
        <SiteFooter.Link href={`${repository}/blob/main/docs/current-status.md`}>
          Known limitations
        </SiteFooter.Link>
      </SiteFooter.Column>
      <SiteFooter.Column title="Developers">
        <SiteFooter.Link href="/packages/">Packages</SiteFooter.Link>
        <SiteFooter.Link href="/docs/">Docs</SiteFooter.Link>
        <SiteFooter.Link href={repository}>GitHub</SiteFooter.Link>
      </SiteFooter.Column>
      <SiteFooter.Column title="Project">
        <SiteFooter.Link href={`${repository}/blob/main/CONTRIBUTING.md`}>
          Contributing
        </SiteFooter.Link>
        <SiteFooter.Link href={`${repository}/blob/main/SECURITY.md`}>Security</SiteFooter.Link>
        <SiteFooter.Link href={`${repository}/blob/main/LICENSE`}>License</SiteFooter.Link>
      </SiteFooter.Column>
    </SiteFooter.Root>
  );
}
