# Anthropic connection

`@amends/connection-anthropic` implements the [connection contract](../../packages/connection/README.md)
for Anthropic's API with `@effect/ai-anthropic`. `AnthropicConnection.declaration` is what a host
registers: model inference through the `anthropic-messages` interface, authenticated by an API
key, with an optional API URL setting for a proxy or gateway in front of Anthropic.

`AnthropicConnection.modelInference.languageModel(access, selection)` builds an Anthropic
`LanguageModel` for the selected model, sending the connection's key as `x-api-key` over fetch.
An empty API URL uses Anthropic's own. A missing or wrong key fails when a request is made.

## Testing

```sh
bun run test adapters/connection-anthropic/test
```

The tests run the model against a fake Anthropic API on a free local port and check the path, key,
and model it receives, with no account.
