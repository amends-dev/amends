import solid from "@astrojs/solid-js"
import starlight from "@astrojs/starlight"
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin"
import { defineConfig } from "astro/config"
import { publishedPackages, repository } from "./src/catalog.ts"

// amends.dev: the home and packages pages are Astro pages that render the design system's site
// sections, and /docs is Starlight, themed from the same tokens. The build is static.
export default defineConfig({
  site: "https://amends.dev",
  trailingSlash: "ignore",
  integrations: [
    solid(),
    starlight({
      title: "amends",
      description: "Where people and agents work together.",
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: repository }],
      editLink: { baseUrl: `${repository}/edit/main/apps/site/` },
      customCss: [
        "@amends-dev/ui/foundations/typography/fonts",
        "@amends-dev/ui/site/fonts",
        "@amends-dev/ui/site/document",
        "@amends-dev/ui/site/starlight"
      ],
      components: { SiteTitle: "./src/components/SiteTitle.astro" },
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Overview", slug: "docs" },
            { label: "Self-host amends", slug: "docs/self-host" }
          ]
        },
        {
          label: "Packages",
          items: publishedPackages.map((pkg) => ({
            label: pkg.name,
            slug: `docs/packages/${pkg.short}`
          }))
        },
        {
          label: "API reference",
          // Short names: these groups sit under the reference's own heading.
          items: publishedPackages.map((pkg) => ({
            label: pkg.short,
            collapsed: true,
            items: [{ autogenerate: { directory: `docs/api/${pkg.short}` } }]
          }))
        }
      ]
    })
  ],
  vite: { plugins: [vanillaExtractPlugin()] }
})
