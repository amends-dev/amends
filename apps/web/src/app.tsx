import { Route, Router } from "@solidjs/router";
import { ThemeContext, createTheme } from "./shell/theme.ts";

/** Provides application appearance around the router. */
export function App() {
  const theme = createTheme();
  return (
    <ThemeContext.Provider value={theme}>
      {/** TODO: ADD SHELL and use it as root for router **/}
      <Router>
        <Route path="/" component={() => <h1>Hello World!</h1>} />
      </Router>
    </ThemeContext.Provider>
  );
}
