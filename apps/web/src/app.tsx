import { NotFoundPage } from "./pages/not-found.tsx";
import { Route, Router } from "@solidjs/router";
import { standalone, workspace, workspaceRoot } from "./routes.tsx";
import { ThemeContext, createTheme } from "./theme/theme.ts";
import { WorkspaceLayout } from "./pages/workspaces/layout.tsx";
import { SessionBoundary } from "./session/boundary.tsx";
export function App() {
  const theme = createTheme();
  return (
    <ThemeContext.Provider value={theme}>
      <SessionBoundary>
        <Router>
          {Object.values(standalone).map((route) => (
            <Route path={route.path} component={route.component} />
          ))}
          <Route path={workspaceRoot} component={WorkspaceLayout}>
            {Object.values(workspace).map((route) => (
              <Route path={route.path} component={route.component} />
            ))}
          </Route>
          <Route path="*unmatched" component={NotFoundPage} />
        </Router>
      </SessionBoundary>
    </ThemeContext.Provider>
  );
}
