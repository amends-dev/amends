# Connected feature conventions

Read [README.md](README.md). Production source imports only client, UI, and Solid.
Keep business operations and request lifetime in client; map their state into UI
props and callbacks here. Do not add routes, persistence configuration, platform APIs,
or direct HTTP contracts. Compose features through nested parts over a scoped Root;
use props for data/options/callbacks, not whole components. Application pages stay
in web and desktop. Export components explicitly; never export workshop fixtures.

Workshop scenarios render production components through the real HTTP host. Keep
server setup under `hosts/local/workshop` and browser fixtures under `workshop`.
Give each scenario isolated state and cleanup. Run portable stories, browser review,
root checks/tests, and the feature Storybook build before completing a change.
