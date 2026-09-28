# Connection

`@amends/connection` is the contract connection implementations fulfil: what an implementation
declares about itself, and, per capability, the code it supplies. A connection is workspace-owned
access to an external system through an implementation; the
[core model](../../docs/core-model.md#agreed-connection-implementations-declare-supported-capabilities)
describes the design, and [core's connection domain](../core/README.md#connections) keeps the
records. The package depends on Effect alone.

## Declarations

`ConnectionImplementation.Declaration` is the data a host registers in its catalog, core checks
connections against, and an app shows when someone adds a connection:

| Field            | Meaning                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `id`             | Names the implementation in connection records, such as `anthropic`.                             |
| `name`           | What people see, such as "Anthropic".                                                            |
| `description`    | A sentence about what it connects to.                                                            |
| `capabilities`   | What its connections can be used for; each names a contract its code fulfils.                    |
| `settings`       | The settings a connection takes, described so an app can ask for them. Never secret.             |
| `authentication` | The ways a connection may authenticate: `None`, or `ApiKey`, a secret kept in protected storage. |

A setting has a `key`, a `label`, a `kind` (`text` or `url`), whether it is `required`, and an
optional `description` and `placeholder`. Model inference is the only capability so far, naming
the provider `interface` a harness must support, such as `anthropic-messages`. Toolkit and channel
support, and OAuth as an authentication method with per-capability scopes, join with the first
implementations that need them.

## Model inference

`@amends/connection/model-inference` holds what an implementation with model inference supplies:
a `ModelInference.Implementation` with its declaration and `languageModel(access, selection)`.
`access` is the connection's settings and credential; `selection` is the model an agent chose, by
the provider's own identifier. It returns Effect AI model access, a `LanguageModel` with its
provider and model names, which a harness such as [amends's own](../harness-amends/README.md)
uses. The module is separate so reading declarations never loads Effect AI.

Implementations live in adapters, such as
[`connection-anthropic`](../../adapters/connection-anthropic/README.md) and
[`connection-openai-compatible`](../../adapters/connection-openai-compatible/README.md); a host
registers the declarations of those it installs.
