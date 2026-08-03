import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CompleteWorkReviewInput,
  CreateFocusBlockInput,
  CreateTaskRecordInput,
  CreateWorkProjectInput,
  FocusBlockTransitionInput,
  ProjectDetailsInput,
  RecordWorkSessionInput,
  UpdateTaskRecordInput,
  workProjectsQueryKey,
  workScopeQueryKey,
  workService,
} from '../services/api'

/** One real Project scope, or the real standalone Work scope when projectId is null. */
export function useWorkProject(projectId: string | null) {
  const queryClient = useQueryClient()

  const projectsQuery = useQuery({
    queryKey: workProjectsQueryKey,
    queryFn: workService.listProjects,
  })
  const scopeQuery = useQuery({
    queryKey: workScopeQueryKey(projectId),
    queryFn: () => workService.getScope(projectId),
  })

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: workProjectsQueryKey }),
      queryClient.invalidateQueries({ queryKey: ['work', 'scope'] }),
    ])
  }
  const id = () => projectId as string

  const createProject = useMutation({
    mutationFn: (input: CreateWorkProjectInput) => workService.createProject(input),
    onSuccess: refresh,
  })
  const updateProject = useMutation({
    mutationFn: (input: ProjectDetailsInput) => workService.updateProject(id(), input),
    onSuccess: refresh,
  })
  const archiveProject = useMutation({
    mutationFn: (archived: boolean) => workService.archiveProject(id(), archived),
    onSuccess: refresh,
  })
  const deleteProject = useMutation({
    mutationFn: () => workService.deleteProject(id()),
    onSuccess: refresh,
  })
  const addTask = useMutation({
    mutationFn: (input: CreateTaskRecordInput) => workService.addTask(id(), input),
    onSuccess: refresh,
  })
  const updateTask = useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: UpdateTaskRecordInput }) =>
      workService.updateTask(id(), taskId, patch),
    onSuccess: refresh,
  })
  const removeTask = useMutation({
    mutationFn: (taskId: string) => workService.removeTask(id(), taskId),
    onSuccess: refresh,
  })
  const createFocusBlock = useMutation({
    mutationFn: (input: CreateFocusBlockInput) => workService.createFocusBlock(input),
    onSuccess: refresh,
  })
  const transitionFocusBlock = useMutation({
    mutationFn: ({ focusBlockId, ...input }: FocusBlockTransitionInput & { focusBlockId: string }) =>
      workService.transitionFocusBlock(focusBlockId, input),
    onSuccess: refresh,
  })
  const completeReview = useMutation({
    mutationFn: ({ focusBlockId, ...input }: CompleteWorkReviewInput & { focusBlockId: string }) =>
      workService.completeReview(focusBlockId, input),
    onSuccess: refresh,
  })
  const recordSession = useMutation({
    mutationFn: (input: RecordWorkSessionInput) => workService.recordSession(input),
    onSuccess: refresh,
  })
  const removeSession = useMutation({
    mutationFn: (sessionId: string) => workService.removeSession(sessionId),
    onSuccess: refresh,
  })

  return {
    projects: projectsQuery.data ?? [],
    isProjectsLoading: projectsQuery.isLoading,
    projectsError: projectsQuery.error,
    scope: scopeQuery.data ?? null,
    isScopeLoading: scopeQuery.isLoading,
    scopeError: scopeQuery.error,
    refetchScope: scopeQuery.refetch,
    createProject,
    updateProject,
    archiveProject,
    deleteProject,
    addTask,
    updateTask,
    removeTask,
    createFocusBlock,
    transitionFocusBlock,
    completeReview,
    recordSession,
    removeSession,
  }
}

export type UseWorkProject = ReturnType<typeof useWorkProject>
