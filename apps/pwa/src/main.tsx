import { registerSW } from "virtual:pwa-register"
import { render } from "solid-js/web"

import { ProductApp } from "./product/app"
import { applyInitialTheme } from "./product/theme-preference"
import { PwaUpdatePrompt } from "./pwa-update"
import "./showcase/styles/tokens.css"
import "./showcase/styles/base.css"
import "./showcase/styles/layout.css"
import "./showcase/styles/components.css"
import "./showcase/styles/responsive.css"
import "./product/product.css"

const root = document.getElementById("root")

if (root === null) {
  throw new TypeError("The application root element is missing")
}

applyInitialTheme()
render(
  () => (
    <>
      <ProductApp />
      <PwaUpdatePrompt registerWorker={registerSW} />
    </>
  ),
  root,
)
