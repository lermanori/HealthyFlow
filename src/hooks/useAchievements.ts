import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  achievementService,
  AchievementDefinitionInput,
  AchievementEntryInput,
} from '../services/api'

const queryKey = ['achievements']

export function useAchievements() {
  const queryClient = useQueryClient()

  const { data: achievements, isLoading } = useQuery({
    queryKey,
    queryFn: () => achievementService.list({ entryLimit: 30 }),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  const createMutation = useMutation({
    mutationFn: (definition: AchievementDefinitionInput) => achievementService.create(definition),
    onSuccess: invalidate,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<AchievementDefinitionInput> & { archived?: boolean } }) =>
      achievementService.update(id, patch),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => achievementService.remove(id),
    onSuccess: invalidate,
  })

  const addEntryMutation = useMutation({
    mutationFn: ({ achievementId, entry }: { achievementId: string; entry: AchievementEntryInput }) =>
      achievementService.addEntry(achievementId, entry),
    onSuccess: invalidate,
  })

  const updateEntryMutation = useMutation({
    mutationFn: ({ entryId, patch }: { entryId: string; patch: Partial<AchievementEntryInput> }) =>
      achievementService.updateEntry(entryId, patch),
    onSuccess: invalidate,
  })

  const deleteEntryMutation = useMutation({
    mutationFn: (entryId: string) => achievementService.removeEntry(entryId),
    onSuccess: invalidate,
  })

  return {
    achievements: achievements ?? [],
    isLoading,
    createAchievement: createMutation.mutate,
    updateAchievement: updateMutation.mutate,
    deleteAchievement: deleteMutation.mutate,
    addEntry: addEntryMutation.mutate,
    updateEntry: updateEntryMutation.mutate,
    deleteEntry: deleteEntryMutation.mutate,
  }
}
