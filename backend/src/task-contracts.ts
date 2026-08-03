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
  RollbackDragMaterializationInputSchema,
}

export default TaskContracts
