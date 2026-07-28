import { z } from 'zod'

export const CategorySchema = z.enum([
  'health',
  'work',
  'personal',
  'fitness',
  'grocery',
  'nutrition',
])

export type Category = z.infer<typeof CategorySchema>

export const RollbackDragMaterializationInputSchema = z.object({
  virtualId: z.string().min(1),
})

export type RollbackDragMaterializationInput = z.infer<
  typeof RollbackDragMaterializationInputSchema
>

const TaskContracts = {
  CategorySchema,
  RollbackDragMaterializationInputSchema,
}

export default TaskContracts
