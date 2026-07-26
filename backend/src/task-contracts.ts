import { z } from 'zod'

export const RollbackDragMaterializationInputSchema = z.object({
  virtualId: z.string().min(1),
})

export type RollbackDragMaterializationInput = z.infer<
  typeof RollbackDragMaterializationInputSchema
>
