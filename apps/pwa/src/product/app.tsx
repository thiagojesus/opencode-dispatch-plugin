import { Navigate, Route, Router } from "@solidjs/router"
import { type JSX, lazy } from "solid-js"
import { SessionDetailPage, SessionsPage } from "../features/sessions/pages"
import { ErrorRoute, NotFoundRoute, OfflineRoute, RevokedRoute } from "./pages"
import { ProductShell } from "./shell"

const ShowcaseRoute = lazy(async () => {
  const module = await import("../showcase/showcase")
  return { default: module.ShowcaseApp }
})

export function ProductApp(): JSX.Element {
  return (
    <Router>
      <Route component={ShowcaseRoute} path="/showcase" />
      <Route component={ProductShell} path="/">
        <Route component={() => <Navigate href="/sessions" />} path="/" />
        <Route component={SessionsPage} path="/sessions" />
        <Route component={SessionDetailPage} path="/sessions/:sessionId" />
        <Route component={OfflineRoute} path="/offline" />
        <Route component={RevokedRoute} path="/revoked" />
        <Route component={ErrorRoute} path="/error" />
        <Route component={NotFoundRoute} path="*unmatched" />
      </Route>
    </Router>
  )
}
