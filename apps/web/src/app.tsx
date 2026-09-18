import { RegistryProvider } from "@effect/atom-solid";
import { Route, Router } from "@solidjs/router";
import type { ParentProps } from "solid-js";
import { entry, workspace, workspaceRoot } from "./routes.tsx";
import { ThemeContext, createTheme } from "./shell/theme.ts";
import { WorkspaceShell } from "./shell/workspace-shell.tsx";

/** Page-lifetime state and appearance around every route. */
function Root(props: ParentProps) {
  const theme = createTheme();
  return (
    <RegistryProvider>
      <ThemeContext.Provider value={theme}>{props.children}</ThemeContext.Provider>
    </RegistryProvider>
  );
}

/**
 * Entry screens stand alone; everything inside a workspace renders within the
 * workspace shell, which checks the membership before mounting its pages.
 */
export function App() {
  return (
    <Router root={Root}>
      {Object.values(entry).map((route) => (
        <Route path={route.path} component={route.component} />
      ))}
      <Route path={workspaceRoot} component={WorkspaceShell}>
        {Object.values(workspace).map((route) => (
          <Route path={route.path} component={route.component} />
        ))}
      </Route>
    </Router>
  );
}
