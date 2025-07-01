import { useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, Check, MoreVertical, Edit, Trash2, Zap, RotateCcw } from 'lucide-react'
import { Task } from '../services/api'
import { format } from 'date-fns'

interface TaskCardProps {
  task: Task
  onComplete: (id: string) => void
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
  onUncomplete?: (id: string) => void
  isDragging?: boolean
}

export default function TaskCard({ task, onComplete, onEdit, onDelete, onUncomplete, isDragging }: TaskCardProps) {
  const [showMenu, setShowMenu] = useState(false)

  const handleComplete = () => {
    if (task.completed && onUncomplete) {
      onUncomplete(task.id)
    } else {
      onComplete(task.id)
    }
  }

  const getCategoryColor = (category: string) => {
    const colors = {
      health: 'bg-green-500/20 text-green-400 border-green-500/30',
      work: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      personal: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      fitness: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      default: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
    return colors[category as keyof typeof colors] || colors.default
  }

  const getTypeColor = (type: string) => {
    return type === 'habit' 
      ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' 
      : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ scale: 1.02 }}
      className={`relative group transition-all duration-300 ${
        isDragging ? 'dragging' : ''
      } ${
        task.completed 
          ? 'opacity-75' 
          : 'hover:shadow-xl hover:shadow-cyan-500/10 hover:border-cyan-500/30'
      }`}
      style={{
        background: task.completed 
          ? 'linear-gradient(135deg, rgba(55, 65, 81, 0.6) 0%, rgba(31, 41, 55, 0.8) 100%)'
          : 'linear-gradient(135deg, rgba(31, 41, 55, 0.95) 0%, rgba(17, 24, 39, 0.98) 100%)',
        backdropFilter: 'blur(10px)',
        border: task.completed 
          ? '1px solid rgba(75, 85, 99, 0.4)'
          : '1px solid rgba(55, 65, 81, 0.6)',
        borderRadius: '1rem',
        padding: '1.5rem',
        boxShadow: task.completed 
          ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
      }}
    >
      {/* Holographic border effect for active tasks */}
      {!task.completed && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/10 via-transparent to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      )}

      <div className="relative flex items-start justify-between">
        <div className="flex items-start space-x-4 flex-1">
          <button
            onClick={handleComplete}
            className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 group/btn ${
              task.completed
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 border-green-500 text-white shadow-lg shadow-green-500/30 hover:from-green-400 hover:to-emerald-500'
                : 'border-gray-500 hover:border-cyan-400 hover:bg-cyan-500/10 hover:shadow-lg hover:shadow-cyan-500/20'
            }`}
            title={task.completed ? 'Click to mark as incomplete' : 'Click to mark as complete'}
          >
            {task.completed ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="relative"
              >
                <Check className="w-3 h-3" />
                {/* Hover overlay for uncomplete action */}
                <div className="absolute inset-0 bg-yellow-500/20 rounded-full opacity-0 group-hover/btn:opacity-100 transition-opacity flex items-center justify-center">
                  <RotateCcw className="w-3 h-3 text-yellow-400" />
                </div>
              </motion.div>
            ) : null}
          </button>

          <div className="flex-1 min-w-0">
            <h3 className={`font-medium transition-all duration-300 ${
              task.completed 
                ? 'line-through text-gray-500' 
                : 'text-gray-100 group-hover:text-cyan-100'
            }`}>
              {task.title}
            </h3>
            
            <div className="flex items-center space-x-3 mt-3">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getCategoryColor(task.category)}`}>
                {task.category}
              </span>
              
              {task.startTime && (
                <div className="flex items-center space-x-1 text-sm text-gray-300">
                  <Clock className="w-4 h-4" />
                  <span>{format(new Date(`2000-01-01T${task.startTime}`), 'h:mm a')}</span>
                </div>
              )}
              
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getTypeColor(task.type)}`}>
                {task.type === 'habit' && <Zap className="w-3 h-3 mr-1" />}
                {task.type}
              </span>
            </div>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-lg hover:bg-gray-700/50 opacity-0 group-hover:opacity-100 transition-all duration-300 text-gray-400 hover:text-gray-200"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              {/* Backdrop to close menu */}
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowMenu(false)}
              />
              
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className="absolute right-0 top-10 w-40 z-50 shadow-xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(31, 41, 55, 0.98) 0%, rgba(17, 24, 39, 0.99) 100%)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(75, 85, 99, 0.6)',
                  borderRadius: '0.75rem',
                  padding: '0.5rem',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 20px rgba(6, 182, 212, 0.1)'
                }}
              >
                {task.completed && onUncomplete && (
                  <button
                    onClick={() => {
                      onUncomplete(task.id)
                      setShowMenu(false)
                    }}
                    className="flex items-center space-x-3 w-full px-4 py-2 text-sm text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300 transition-colors rounded-lg"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Mark Incomplete</span>
                  </button>
                )}
                
                <button
                  onClick={() => {
                    onEdit(task)
                    setShowMenu(false)
                  }}
                  className="flex items-center space-x-3 w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/50 hover:text-cyan-400 transition-colors rounded-lg"
                >
                  <Edit className="w-4 h-4" />
                  <span>Edit</span>
                </button>
                
                <button
                  onClick={() => {
                    onDelete(task.id)
                    setShowMenu(false)
                  }}
                  className="flex items-center space-x-3 w-full px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              </motion.div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}