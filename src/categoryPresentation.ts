import { z } from 'zod'
import TaskContracts, { type Category } from '../backend/src/task-contracts'

const { CategorySchema } = TaskContracts

const CategoryIconSchema = z.enum([
  'heart',
  'briefcase',
  'user',
  'dumbbell',
  'basket',
  'utensils',
])

const CategoryPresentationSchema = z.object({
  id: CategorySchema,
  label: z.string().min(1),
  icon: CategoryIconSchema,
  className: z.string().min(1),
}).strict()

export type CategoryPresentation = z.infer<typeof CategoryPresentationSchema>

export const CATEGORY_PRESENTATIONS = z.array(CategoryPresentationSchema).parse([
  {
    id: 'health',
    label: 'Health',
    icon: 'heart',
    className: 'border-category-health/30 bg-category-health/10 text-category-health',
  },
  {
    id: 'work',
    label: 'Work',
    icon: 'briefcase',
    className: 'border-category-work/30 bg-category-work/10 text-category-work',
  },
  {
    id: 'personal',
    label: 'Personal',
    icon: 'user',
    className: 'border-category-personal/30 bg-category-personal/10 text-category-personal',
  },
  {
    id: 'fitness',
    label: 'Fitness',
    icon: 'dumbbell',
    className: 'border-category-fitness/30 bg-category-fitness/10 text-category-fitness',
  },
  {
    id: 'grocery',
    label: 'Grocery',
    icon: 'basket',
    className: 'border-category-grocery/30 bg-category-grocery/10 text-category-grocery',
  },
  {
    id: 'nutrition',
    label: 'Nutrition',
    icon: 'utensils',
    className: 'border-category-nutrition/30 bg-category-nutrition/10 text-category-nutrition',
  },
])

export const CATEGORY_IDS = CATEGORY_PRESENTATIONS.map(({ id }) => id)

const presentationById = Object.fromEntries(
  CATEGORY_PRESENTATIONS.map((presentation) => [presentation.id, presentation])
) as Record<Category, CategoryPresentation>

export function getCategoryPresentation(value: unknown): CategoryPresentation {
  const parsed = CategorySchema.safeParse(value)
  return presentationById[parsed.success ? parsed.data : 'personal']
}
