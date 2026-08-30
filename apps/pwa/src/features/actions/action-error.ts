import { RemoteApiError } from "../../api/generated-client"

export type ActionFailure = {
  readonly code?: string
  readonly message: string
  readonly retryable: boolean
}

export function actionFailureFrom(error: unknown, fallback: string): ActionFailure {
  if (error instanceof RemoteApiError) {
    return {
      code: error.code,
      message: error.publicMessage,
      retryable: error.retryable,
    }
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return { message: "The request stopped before acceptance was confirmed.", retryable: true }
  }
  return { message: fallback, retryable: false }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}
