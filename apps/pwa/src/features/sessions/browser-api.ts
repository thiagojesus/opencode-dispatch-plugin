import { createGeneratedApiClient, type GeneratedApiRequest } from "../../api/generated-client"

export const browserApi = createGeneratedApiClient({
  async request(input: GeneratedApiRequest): Promise<unknown> {
    const response = await fetch(
      input.path,
      "body" in input
        ? {
            method: input.method,
            signal: input.signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input.body),
          }
        : { method: input.method, signal: input.signal },
    )
    return response.json()
  },
})
