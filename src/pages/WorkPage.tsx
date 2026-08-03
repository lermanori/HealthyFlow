import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Square } from 'lucide-react'
import toast from 'react-hot-toast'
import type {
  CompleteWorkReviewInput,
  CreateFocusBlockInput,
  CreateTaskRecordInput,
  CreateWorkProjectInput,
  FocusBlockTransitionInput,
  ProjectContext,
  ProjectDetailsInput,
  RecordWorkSessionInput,
  TaskRecord,
  UpdateTaskRecordInput,
} from '../services/api'
import { useWorkProject } from '../hooks/useWorkProject'
import LoadingSpinner from '../components/LoadingSpinner'
import ProjectSwitcher from '../components/work/ProjectSwitcher'
import ProjectTargetCard from '../components/work/ProjectTargetCard'
import FocusBlockCard from '../components/work/FocusBlockCard'
import TaskRecordsCard from '../components/work/TaskRecordsCard'
import ProjectContextCard from '../components/work/ProjectContextCard'
import WorkSessionsCard from '../components/work/WorkSessionsCard'
import AddRecordModal, { type RecordTab } from '../components/work/AddRecordModal'
import { workTalkState } from '../workTalk'

const LAST_SCOPE_KEY = 'healthyflow-work-last-scope'

export default function WorkPage() {
  const navigate = useNavigate()
  const [projectId, setProjectId] = useState<string | null>(() => {
    const stored = localStorage.getItem(LAST_SCOPE_KEY)
    return stored && stored !== 'standalone' ? stored : null
  })
  const [modalTab, setModalTab] = useState<RecordTab | null>(null)
  const [prefillTaskId, setPrefillTaskId] = useState<string | null>(null)
  const work = useWorkProject(projectId)
  const scope = work.scope
  const project = scope?.project ?? null
  const tasks = scope?.tasks ?? []

  useEffect(() => {
    localStorage.setItem(LAST_SCOPE_KEY, projectId ?? 'standalone')
  }, [projectId])
  useEffect(() => {
    if (projectId && !work.isProjectsLoading && !work.projects.some(option => option.id === projectId)) setProjectId(null)
  }, [projectId, work.isProjectsLoading, work.projects])

  const mutations = [work.createProject, work.updateProject, work.archiveProject, work.deleteProject, work.addTask, work.updateTask, work.removeTask, work.createFocusBlock, work.transitionFocusBlock, work.completeReview, work.recordSession, work.removeSession]
  const isBusy = mutations.some(mutation => mutation.isPending)
  const failed = (action: string) => (error: unknown) => {
    const message = (error as any)?.response?.data?.error
    toast.error(typeof message === 'string' ? message : `Could not ${action}. Nothing was changed.`)
  }
  const closeModal = () => { setModalTab(null); setPrefillTaskId(null) }

  const updateTask = (taskId: string, patch: UpdateTaskRecordInput) => work.updateTask.mutate({ taskId, patch }, { onSuccess: () => toast.success('Task updated'), onError: failed('update the Task') })
  const transition = (focusBlockId: string, action: FocusBlockTransitionInput['action']) => work.transitionFocusBlock.mutate({ focusBlockId, action }, { onSuccess: block => toast.success(block.status === 'active' ? 'Focus block active' : block.status === 'reviewing' ? 'Review required before completion' : `Focus block ${block.status}`), onError: failed(`${action} the Focus block`) })
  const review = (focusBlockId: string, input: CompleteWorkReviewInput) => work.completeReview.mutate({ focusBlockId, ...input }, { onSuccess: () => toast.success('Review completed and one Work session recorded'), onError: failed('complete the review') })

  const isLoading = work.isProjectsLoading || work.isScopeLoading
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div className="flex min-w-[260px] flex-1 items-start gap-3.5"><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/10"><Square className="h-4 w-4 text-accent" /></span><div><h1 className="text-[26px] font-semibold text-ink">Work</h1><p className="mt-1.5 max-w-[52ch] text-sm leading-relaxed text-ink-soft">Plan, execute, review, and preserve focused Work manually. Talk is optional.</p></div></div>
        <div className="flex flex-wrap gap-2">
          {project && <button type="button" onClick={() => navigate('/talk', { state: workTalkState({ label: `${project.name} · optional discussion`, prompt: `Help me think about ${project.name}. Target: ${project.target ?? 'not recorded'}. Milestone: ${project.milestone ?? 'not recorded'}. Do not change records without asking.` }) })} className="btn-secondary min-h-11 px-4 py-0 text-sm">Discuss in Talk</button>}
          <button type="button" onClick={() => setModalTab('focus')} className="btn-primary inline-flex min-h-11 items-center gap-2 px-4 py-0 text-sm"><Plus className="h-4 w-4" />Add manually</button>
        </div>
      </header>

      <ProjectSwitcher projects={work.projects} project={project} onSelect={setProjectId} onCreate={() => setModalTab('project')} />

      {isLoading && <div className="flex min-h-[40vh] items-center justify-center"><LoadingSpinner size="lg" label="Loading Work" /></div>}
      {!isLoading && work.scopeError && <section className="card" role="alert"><h2 className="text-lg font-semibold text-ink">Could not load Work</h2><button type="button" onClick={() => void work.refetchScope()} className="btn-primary mt-4 min-h-11 px-4 py-0 text-sm">Retry</button></section>}

      {!isLoading && scope && !work.scopeError && <>
        {project ? <>
          <ProjectTargetCard
            project={project}
            isBusy={isBusy}
            onUpdate={(input: ProjectDetailsInput) => work.updateProject.mutate(input, { onSuccess: () => toast.success('Project updated'), onError: failed('update the Project') })}
            onArchive={archived => work.archiveProject.mutate(archived, { onSuccess: () => toast.success(archived ? 'Project archived' : 'Project restored'), onError: failed('change the archive state') })}
            onDelete={() => work.deleteProject.mutate(undefined, { onSuccess: () => { toast.success('Project deleted; Tasks and history were preserved'); setProjectId(null) }, onError: failed('delete the Project') })}
          />
          <ProjectContextCard
            project={project}
            isBusy={isBusy}
            onSaveContext={(context: Partial<ProjectContext>) => work.updateProject.mutate({ context }, { onSuccess: () => toast.success('Project context updated'), onError: failed('save Project context') })}
          />
          <TaskRecordsCard
            projectName={project.name}
            tasks={tasks}
            isBusy={isBusy}
            onUpdateTask={updateTask}
            onRemoveTask={taskId => work.removeTask.mutate(taskId, { onSuccess: () => toast.success('Task deleted'), onError: failed('delete the Task') })}
            onStartTask={(task: TaskRecord) => { setPrefillTaskId(task.id); setModalTab('focus') }}
            onAddTask={() => setModalTab('task')}
          />
        </> : <section className="surface-section p-5"><h2 className="text-lg font-semibold text-ink">Standalone Work</h2><p className="mt-2 max-w-[54ch] text-sm text-ink-soft">Use bounded title and context for focused work that does not belong to a Project. No synthetic Project is created.</p></section>}

        <FocusBlockCard project={project} tasks={tasks} blocks={scope.focusBlocks} isBusy={isBusy} onPlan={() => setModalTab('focus')} onTransition={transition} onReview={review} />
        <WorkSessionsCard sessions={scope.sessions} tasks={tasks} isBusy={isBusy} onRecordSession={() => setModalTab('session')} onRemoveSession={sessionId => work.removeSession.mutate(sessionId, { onSuccess: () => toast.success('Historical Work session deleted'), onError: failed('delete the Work session') })} />
      </>}

      <AddRecordModal
        open={modalTab !== null}
        initialTab={modalTab ?? 'focus'}
        project={project}
        tasks={tasks}
        prefillTaskId={prefillTaskId}
        isBusy={isBusy}
        onClose={closeModal}
        onCreateTask={(input: CreateTaskRecordInput) => work.addTask.mutate(input, { onSuccess: () => { toast.success('Task added'); closeModal() }, onError: failed('add the Task') })}
        onCreateProject={(input: CreateWorkProjectInput) => work.createProject.mutate(input, { onSuccess: created => { setProjectId(created.id); toast.success('Project created'); closeModal() }, onError: failed('create the Project') })}
        onCreateFocusBlock={(input: CreateFocusBlockInput) => work.createFocusBlock.mutate(input, { onSuccess: () => { toast.success('Focus block scheduled'); closeModal() }, onError: failed('schedule the Focus block') })}
        onRecordSession={(input: RecordWorkSessionInput) => work.recordSession.mutate(input, { onSuccess: () => { toast.success('Historical Work session recorded'); closeModal() }, onError: failed('record the Work session') })}
      />
    </div>
  )
}
