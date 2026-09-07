import { z } from 'zod'

export const ContactMessageKindSchema = z.enum(['feedback', 'more_actions'])
export type ContactMessageKind = z.infer<typeof ContactMessageKindSchema>

export const ContactMessageStatusSchema = z.enum(['pending', 'handled'])
export type ContactMessageStatus = z.infer<typeof ContactMessageStatusSchema>

export const ContactMessageCreateSchema = z.object({
  kind: ContactMessageKindSchema,
  message: z.string().trim().min(1).max(1000),
  replyTo: z.string().trim().email().max(254).optional(),
})
export type ContactMessageCreate = z.infer<typeof ContactMessageCreateSchema>

export const ContactMessageRowSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  kind: ContactMessageKindSchema,
  message: z.string().min(1).max(1000),
  reply_to: z.string().email().nullable(),
  status: ContactMessageStatusSchema,
  handled_at: z.string().nullable(),
  handled_by: z.string().min(1).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type ContactMessageRow = z.infer<typeof ContactMessageRowSchema>

export const ContactMessageSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  userEmail: z.string().email().nullable(),
  userName: z.string().nullable(),
  kind: ContactMessageKindSchema,
  message: z.string().min(1).max(1000),
  replyTo: z.string().email().nullable(),
  status: ContactMessageStatusSchema,
  handledAt: z.string().nullable(),
  handledBy: z.string().min(1).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ContactMessage = z.infer<typeof ContactMessageSchema>

export const ContactMessageListSchema = z.array(ContactMessageSchema)

const ContactMessageContracts = {
  ContactMessageKindSchema,
  ContactMessageStatusSchema,
  ContactMessageCreateSchema,
  ContactMessageRowSchema,
  ContactMessageSchema,
  ContactMessageListSchema,
}

export default ContactMessageContracts
