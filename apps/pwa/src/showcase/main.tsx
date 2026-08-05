import { registerSW } from "virtual:pwa-register"
import { render } from "solid-js/web"

import { ShowcaseApp } from "./showcase"
import "./styles/tokens.css"
import "./styles/base.css"
import "./styles/layout.css"
import "./styles/components.css"
import "./styles/responsive.css"

const root = document.getElementById("root")

if (root === null) {
  throw new TypeError("The showcase root element is missing")
}

render(() => <ShowcaseApp />, root)
registerSW({ immediate: true })
