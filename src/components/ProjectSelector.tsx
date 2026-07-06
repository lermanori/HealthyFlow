import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Folder, FolderOpen, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { projectService } from '../services/api'
import { motion, AnimatePresence } from 'framer-motion'

interface ProjectSelectorProps {
  selectedProjectId?: string
  onProjectSelect: (projectId: string | undefined) => void
  className?: string
}

export default function ProjectSelector({ 
  selectedProjectId, 
  onProjectSelect, 
  className = "" 
}: ProjectSelectorProps) {
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectColor, setNewProjectColor] = useState('#3B82F6')

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: projectService.getProjects
  })

  const activeProjects = projects.filter(p => !p.isArchived)
  const selectedProject = projects.find(p => p.id === selectedProjectId)

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return

    try {
      const newProject = await projectService.createProject({
        name: newProjectName.trim(),
        color: newProjectColor,
        isArchived: false
      })
      setNewProjectName('')
      setShowCreateForm(false)
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      onProjectSelect(newProject.id)
    } catch (error) {
      console.error('Failed to create project:', error)
      toast.error('Failed to create project')
    }
  }

  const projectColors = [
    '#3B82F6', // blue
    '#10B981', // emerald
    '#F59E0B', // amber
    '#EF4444', // red
    '#8B5CF6', // violet
    '#F97316', // orange
    '#06B6D4', // cyan
    '#84CC16', // lime
  ]

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-ink-soft mb-2">
        Project (Optional)
      </label>
      
      <div className="space-y-2">
        {/* Current Selection */}
        <div className="relative">
          {selectedProject ? (
            <div 
              className="flex items-center space-x-3 p-3 rounded-lg border border-line-strong bg-card/50"
              style={{ borderLeftColor: selectedProject.color, borderLeftWidth: '4px' }}
            >
              <FolderOpen className="w-4 h-4 text-ink-muted" />
              <span className="text-ink-soft flex-1">{selectedProject.name}</span>
              <button
                type="button"
                onClick={() => onProjectSelect(undefined)}
                className="text-ink-muted hover:text-ink-soft transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="text-ink-muted text-sm p-3 border border-dashed border-line-strong rounded-lg text-center">
              No project selected
            </div>
          )}
        </div>

        {/* Project List */}
        {!selectedProject && (
          <div className="max-h-40 overflow-y-auto space-y-1">
            {activeProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onProjectSelect(project.id)}
                className="w-full flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-700/50 transition-colors text-left"
                style={{ borderLeft: `3px solid ${project.color}` }}
              >
                <Folder className="w-4 h-4 text-ink-muted flex-shrink-0" />
                <span className="text-ink-soft truncate">{project.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Create New Project */}
        <AnimatePresence>
          {showCreateForm ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 p-3 bg-card/30 rounded-lg border border-line"
            >
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name..."
                className="w-full input-field text-sm"
                autoFocus
              />
              
              <div className="flex items-center space-x-2">
                <span className="text-xs text-ink-muted">Color:</span>
                <div className="flex space-x-1">
                  {projectColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewProjectColor(color)}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        newProjectColor === color 
                          ? 'border-white scale-110' 
                          : 'border-line-strong hover:border-gray-400'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim()}
                  className="flex-1 px-3 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false)
                    setNewProjectName('')
                  }}
                  className="flex-1 px-3 py-2 bg-gray-700/50 text-ink-soft border border-line-strong rounded-lg text-sm hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="w-full flex items-center justify-center space-x-2 p-2 text-ink-muted hover:text-cyan-400 border border-dashed border-line-strong hover:border-cyan-500/50 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">Create New Project</span>
            </button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
} 