# Shared-package conventions

Read the module, naming, and construction conventions in [README.md](./README.md)
before changing shared packages. A focused feature can occupy one file; group
related modules in a feature directory as it grows. Keep canonical namespace
exports and import owning leaf modules internally. Preserve encoded contracts
when renaming TypeScript fields, and test codec compatibility.

Service implementations expose
`make` and delegate to it from `layer`; contracts and HTTP registration layers
follow their framework's declaration and composition APIs. Keep operation-time
identity and transaction requirements separate from construction dependencies.
