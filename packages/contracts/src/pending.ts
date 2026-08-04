import { z } from "zod"

import {
  MAX_ANSWERS_PER_QUESTION,
  MAX_PENDING_ACTIONS,
  MAX_QUESTION_OPTIONS,
  MAX_QUESTIONS_PER_REQUEST,
  MAX_SHORT_TEXT_LENGTH,
} from "./constants.ts"
import {
  CallIdSchema,
  MessageIdSchema,
  PermissionRequestIdSchema,
  QuestionRequestIdSchema,
} from "./ids.ts"

const PermissionSourceSchema = z
  .strictObject({
    messageId: MessageIdSchema,
    callId: CallIdSchema,
  })
  .readonly()

export const PermissionRequestSchema = z
  .strictObject({
    id: PermissionRequestIdSchema,
    action: z.string().trim().min(1).max(128),
    resources: z
      .array(z.string().min(1).max(MAX_SHORT_TEXT_LENGTH))
      .min(1)
      .max(MAX_PENDING_ACTIONS)
      .readonly(),
    source: PermissionSourceSchema.optional(),
  })
  .readonly()
export type PermissionRequest = z.infer<typeof PermissionRequestSchema>

export const PermissionRequestListSchema = z
  .array(PermissionRequestSchema)
  .max(MAX_PENDING_ACTIONS)
  .readonly()

export const PermissionDecisionSchema = z.enum(["once", "reject"])
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>

const QuestionOptionSchema = z
  .strictObject({
    label: z.string().trim().min(1).max(80),
    description: z.string().max(MAX_SHORT_TEXT_LENGTH),
  })
  .readonly()

const QuestionInfoSchema = z
  .strictObject({
    header: z.string().trim().min(1).max(30),
    question: z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH),
    options: z.array(QuestionOptionSchema).min(1).max(MAX_QUESTION_OPTIONS).readonly(),
    multiple: z.boolean().default(false),
    custom: z.boolean().default(false),
  })
  .readonly()

export const QuestionRequestSchema = z
  .strictObject({
    id: QuestionRequestIdSchema,
    questions: z.array(QuestionInfoSchema).min(1).max(MAX_QUESTIONS_PER_REQUEST).readonly(),
  })
  .readonly()
export type QuestionRequest = z.infer<typeof QuestionRequestSchema>

export const QuestionRequestListSchema = z
  .array(QuestionRequestSchema)
  .max(MAX_PENDING_ACTIONS)
  .readonly()

const QuestionAnswerSchema = z
  .array(z.string().trim().min(1).max(MAX_SHORT_TEXT_LENGTH))
  .min(1)
  .max(MAX_ANSWERS_PER_QUESTION)
  .readonly()

export const QuestionReplyAnswersSchema = z
  .array(QuestionAnswerSchema)
  .min(1)
  .max(MAX_QUESTIONS_PER_REQUEST)
  .readonly()
export type QuestionReplyAnswers = z.infer<typeof QuestionReplyAnswersSchema>
