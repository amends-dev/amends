# Shared-package construction conventions

Read the constructor and layer conventions in [README.md](./README.md) before
changing construction APIs or service wiring. Service implementations expose
`make` and delegate to it from `layer`; contracts and HTTP registration layers
follow their framework's declaration and composition APIs. Keep operation-time
identity and transaction requirements separate from construction dependencies.
