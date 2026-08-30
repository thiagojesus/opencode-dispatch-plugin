import { createContext, useContext } from "solid-js"

import type { ContinuityKind } from "../ui/continuity"

export type ProductContinuityChannel = {
  readonly clear: (source: symbol) => void
  readonly publish: (source: symbol, kind: ContinuityKind) => void
}

export const ProductContinuityContext = createContext<ProductContinuityChannel>()

export function useProductContinuity(): ProductContinuityChannel {
  const channel = useContext(ProductContinuityContext)
  if (channel === undefined) {
    throw new TypeError("Session continuity requires the product shell provider.")
  }
  return channel
}
