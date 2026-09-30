# OpenAI-compatible connection

`@amends/connection-openai-compatible` implements the
[connection contract](../../packages/connection/README.md) for any API implementing OpenAI's chat
completions, with `@effect/ai-openai-compat`: OpenAI itself, OpenRouter, Groq, or a local server.
`OpenAiCompatibleConnection.declaration` declares model inference through the
`openai-chat-completions` interface, with a required API URL, the base before
`/chat/completions`, an optional context window in tokens, since servers and models vary, and either
an API key or, for a server that needs none, no authentication.

`OpenAiCompatibleConnection.modelInference.languageModel(access, selection)` builds a
chat-completions `LanguageModel` for the selected model over fetch, sending the key as a bearer
token when the connection has one. `limits` gives the connection's context window, or 128,000
tokens when it has none.

## Testing

```sh
bun run test adapters/connection-openai-compatible/test
```

The tests run the model against a fake chat-completions API on a free local port, with a key and
without.
