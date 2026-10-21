// ❌ Bad: the binding must be PascalCase and match the declared Command name.
const fetchWeather = WeatherDefinition.command('FetchWeather', {
  messages: [Message.CompletedFetchWeather],
})

const SaveWeather = WeatherDefinition.command('FetchWeather', {
  messages: [Message.CompletedFetchWeather],
})

// ✅ Good: the declaration and binding name match.
const FetchWeather = WeatherDefinition.command('FetchWeather', {
  messages: [Message.CompletedFetchWeather],
})
