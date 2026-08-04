export const PROTOCOL_VERSION = 1 as const
export const CONTROL_CAPABILITY = "opencode-dispatch-plugin/cap/control" as const

export const DEFAULT_BROKER_HOST = "127.0.0.1" as const
export const DEFAULT_BROKER_PORT = 43_110
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000
export const DEFAULT_REGISTRATION_TTL_MS = 15_000
export const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 500
export const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000
export const DEFAULT_RECONNECT_MAX_ATTEMPTS = 8
export const DEFAULT_PAGE_SIZE = 50

export const MAX_PAGE_SIZE = 100
export const MAX_PROMPT_BYTES = 32 * 1_024
export const MAX_PUBLIC_PAYLOAD_BYTES = 1_024 * 1_024
export const MAX_EVENT_BATCH_SIZE = 256
export const MAX_TIMELINE_ITEMS = 1_000
export const MAX_TODOS = 200
export const MAX_PENDING_ACTIONS = 100
export const MAX_QUESTIONS_PER_REQUEST = 16
export const MAX_QUESTION_OPTIONS = 20
export const MAX_ANSWERS_PER_QUESTION = 20
export const MAX_ID_LENGTH = 256
export const MAX_CURSOR_LENGTH = 512
export const MAX_TITLE_LENGTH = 512
export const MAX_SHORT_TEXT_LENGTH = 4_096
