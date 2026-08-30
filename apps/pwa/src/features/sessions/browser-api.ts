import { createGeneratedApiClient, type GeneratedApiRequest } from "../../api/generated-client"

export const browserApi = createGeneratedApiClient({
  async request(input: GeneratedApiRequest): Promise<unknown> {
    const response = await fetch(
      input.path,
      "body" in input
        ? {
            cache: "no-store",
            method: input.method,
            signal: input.signal,
            headers: { "cache-control": "no-store", "content-type": "application/json" },
            body: JSON.stringify(input.body),
          }
        : {
            cache: "no-store",
            method: input.method,
            signal: input.signal,
            headers: { "cache-control": "no-store" },
          },
    )
    return response.json()
  },
})
