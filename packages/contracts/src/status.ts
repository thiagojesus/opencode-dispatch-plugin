import { z } from "zod"

import { MAX_SHORT_TEXT_LENGTH, MAX_TODOS } from "./constants.ts"
import { UnixEpochMsSchema } from "./ids.ts"

const IdleStatusSchema = z.strictObject({ type: z.literal("idle") })
const BusyStatusSchema = z.strictObject({ type: z.literal("busy") })
const RetryStatusSchema = z.strictObject({
  type: z.literal("retry"),
  attempt: z.number().int().nonnegative().max(32),
  message: z.string().min(1).max(MAX_SHORT_TEXT_LENGTH),
  nextRetryAt: UnixEpochMsSchema,
})

export const SessionStatusSchema = z
  .discriminatedUnion("type", [IdleStatusSchema, BusyStatusSchema, RetryStatusSchema])
  .readonly()
export type SessionStatus = z.infer<typeof SessionStatusSchema>

export const TodoItemSchema = z
  .strictObject({
    content: z.string().min(1).max(MAX_SHORT_TEXT_LENGTH),
    status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
    priority: z.enum(["high", "medium", "low"]),
  })
  .readonly()
export type TodoItem = z.infer<typeof TodoItemSchema>

export const TodoListSchema = z.array(TodoItemSchema).max(MAX_TODOS).readonly()
export type TodoList = z.infer<typeof TodoListSchema>
