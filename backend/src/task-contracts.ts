import { z } from 'zod'

export const CategorySchema = z.enum([
  'health',
  'work',
  'personal',
  'fitness',
  'grocery',
  'nutrition',
])

export const ItemTypeSchema = z.enum(['task', 'habit', 'grocery', 'meal', 'workout'])

// Bounded Item shape exposed by the capability layer. It deliberately mirrors
// the REST mapper without carrying persistence-only fields such as `user_id`.
export const CapabilityItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: ItemTypeSchema,
  category: CategorySchema.nullable(),
  completed: z.boolean(),
  scheduledDate: z.string().date().nullable(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  location: z.string().nullable(),
  duration: z.number().nullable(),
  repeat: z.enum(['none', 'daily', 'weekly']).nullable(),
  position: z.number().int().nullable(),
  isHabitInstance: z.boolean(),
  originalHabitId: z.string().nullable(),
  rolledOverFromTaskId: z.string().nullable(),
  originalCreatedAt: z.string().nullable(),
  googleEventId: z.string().nullable(),
  syncedToGoogle: z.boolean(),
  createdAt: z.string().nullable(),
})
export type CapabilityItem = z.infer<typeof CapabilityItemSchema>

export type Category = z.infer<typeof CategorySchema>

export const RollbackDragMaterializationInputSchema = z.object({
  virtualId: z.string().min(1),
})

export type RollbackDragMaterializationInput = z.infer<
  typeof RollbackDragMaterializationInputSchema
>

const TaskContracts = {
  CategorySchema,
  ItemTypeSchema,
  CapabilityItemSchema,
  RollbackDragMaterializationInputSchema,
}

export default TaskContracts
