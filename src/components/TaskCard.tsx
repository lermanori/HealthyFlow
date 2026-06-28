import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Clock, Check, MoreVertical, Edit, Trash2, Zap, RotateCcw, Calendar,
  ShoppingCart, Utensils, Dumbbell, CheckSquare, Circle, Flame,
  DollarSign, Target, Folder, RefreshCw, AlertTriangle, MapPin
} from 'lucide-react'
import { Task } from '../services/api'
import { format, parseISO } from 'date-fns'

interface TaskCardProps {
  task: Task
  onComplete: (id: string) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  onUncomplete?: (id: string) => void
  isDragging?: boolean
  className?: string
  compact?: boolean
}

export default function TaskCard({ task, onComplete, onEdit, onDelete, onUncomplete, isDragging, className = '', compact = false }: TaskCardProps) {
  const [showMenu, setShowMenu] = useState(false)

  const handleComplete = () => {
    if (task.completed && onUncomplete) {
      onUncomplete(task.id)
    } else {
      onComplete(task.id)
    }
  }

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'grocery':
        return <ShoppingCart className="w-4 h-4" />
      case 'meal':
        return <Utensils className="w-4 h-4" />
      case 'workout':
        return <Dumbbell className="w-4 h-4" />
      case 'habit':
        return <RotateCcw className="w-4 h-4" />
      case 'task':
        return <CheckSquare className="w-4 h-4" />
      default:
        return <Circle className="w-4 h-4" />
    }
  }

  const getCategoryColor = (category: string) => {
    const colors = {
      health: 'bg-green-500/20 text-green-400 border-green-500/30',
      work: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      personal: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      fitness: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      // New categories for unified items
      grocery: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      nutrition: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      workout: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      default: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
    return colors[category as keyof typeof colors] || colors.default
  }

  const getTypeColor = (type: string) => {
    const colors = {
      habit: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      task: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      grocery: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      meal: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      workout: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    }
    return colors[type as keyof typeof colors] || colors.task
  }

  const renderItemDetails = () => {
    switch (task.type) {
      case 'grocery':
        return (
          <div className="flex items-center space-x-2 text-xs text-gray-400 mt-1">
            {task.groceryInfo?.quantity && (
              <span className="flex items-center space-x-1">
                <Target className="w-3 h-3" />
                <span>{task.groceryInfo.quantity}</span>
              </span>
            )}
            {task.groceryInfo?.price && (
              <span className="flex items-center space-x-1">
                <DollarSign className="w-3 h-3" />
                <span>${task.groceryInfo.price.toFixed(2)}</span>
              </span>
            )}
            {task.groceryInfo?.groceryCategory && (
              <span className={`px-2 py-1 rounded-full text-xs ${getCategoryColor(task.groceryInfo.groceryCategory)}`}>
                {task.groceryInfo.groceryCategory}
              </span>
            )}
          </div>
        )
      
      case 'meal':
        return (
          <div className="space-y-1 mt-2">
            <div className="flex items-center space-x-2 text-xs text-gray-400">
              {task.mealInfo?.mealType && (
                <span className={`px-2 py-1 rounded-full text-xs ${getCategoryColor('nutrition')}`}>
                  {task.mealInfo.mealType}
                </span>
              )}
              {task.mealInfo?.calories && (
                <span className="flex items-center space-x-1">
                  <Flame className="w-3 h-3" />
                  <span>{task.mealInfo.calories} cal</span>
                </span>
              )}
            </div>
            {task.mealInfo?.ingredients && task.mealInfo.ingredients.length > 0 && (
              <div className="text-xs text-gray-500 truncate">
                {task.mealInfo.ingredients.slice(0, 3).map(ing => ing.name).join(', ')}
                {task.mealInfo.ingredients.length > 3 && '...'}
              </div>
            )}
          </div>
        )
      
      case 'workout':
        return (
          <div className="space-y-1 mt-2">
            <div className="flex items-center space-x-2 text-xs text-gray-400">
              {task.workoutInfo?.workoutType && (
                <span className={`px-2 py-1 rounded-full text-xs ${getCategoryColor('workout')}`}>
                  {task.workoutInfo.workoutType}
                </span>
              )}
              {task.workoutInfo?.intensity && (
                <span className={`px-2 py-1 rounded-full text-xs ${
                  task.workoutInfo.intensity === 'high' ? 'bg-red-500/20 text-red-400' :
                  task.workoutInfo.intensity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-green-500/20 text-green-400'
                }`}>
                  {task.workoutInfo.intensity}
                </span>
              )}
            </div>
            {task.workoutInfo?.exercises && task.workoutInfo.exercises.length > 0 && (
              <div className="text-xs text-gray-500">
                {task.workoutInfo.exercises.length} exercise{task.workoutInfo.exercises.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )
      
      default:
        return null
    }
  }

  const renderGoogleSyncBadge = () => {
    if (!task.startTime || task.type !== 'task') return null

    if (task.syncedToGoogle && task.googleSyncStatus === 'synced') {
      return (
        <span className={`flex items-center space-x-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 text-xs text-emerald-300 ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}>
          <Calendar className="w-3 h-3" />
          <span>Synced</span>
        </span>
      )
    }

    if (task.googleSyncStatus === 'failed') {
      return (
        <span className={`flex items-center space-x-1 rounded-full border border-red-500/30 bg-red-500/15 text-xs text-red-300 ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}>
          <AlertTriangle className="w-3 h-3" />
          <span>Sync failed</span>
        </span>
      )
    }

    if (task.googleSyncStatus === 'pending') {
      return (
        <span className={`flex items-center space-x-1 rounded-full border border-cyan-500/30 bg-cyan-500/15 text-xs text-cyan-300 ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}>
          <RefreshCw className="w-3 h-3" />
          <span>Syncing</span>
        </span>
      )
    }

    return null
  }

  // Check if this is a rolled over task
  const isRolledOver = task.createdAt && task.completedAt &&
    (new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime() >= 24 * 60 * 60 * 1000);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ 
        opacity: 1, 
        y: 0,
        scale: isDragging ? 1.02 : 1,
        boxShadow: isDragging ? '0 20px 40px rgba(0,0,0,0.3)' : '0 4px 8px rgba(0,0,0,0.1)'
      }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ scale: 1.01 }}
      className={`group relative border transition-all duration-300 ${
        compact ? `flex rounded-lg p-2.5 ${showMenu ? 'overflow-visible' : 'overflow-hidden'}` : 'rounded-xl p-4'
      } ${
        task.completed 
          ? 'bg-gray-800/50 border-gray-600/50 opacity-75' 
          : 'card glass-effect hover:shadow-lg'
      } ${showMenu ? 'z-[100]' : ''} ${isDragging ? 'z-10 rotate-1' : ''} ${className}`}
    >
      {/* Completion Checkbox */}
      <div className={`flex min-h-0 min-w-0 ${compact ? 'w-full items-center gap-2' : 'items-start space-x-3'}`}>
        <button
          onClick={handleComplete}
          className={`flex-shrink-0 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all duration-300 ${
            compact ? '!h-4 !min-h-0 !w-4 !min-w-0 sm:!h-5 sm:!w-5' : 'h-5 w-5'
          } ${
            task.completed
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 border-green-500 text-white'
              : 'border-gray-600 hover:border-cyan-400 hover:bg-cyan-400/10'
          }`}
        >
          {task.completed && <Check className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />}
        </button>

        <div className="min-w-0 flex-1">
          {/* Header with title and type */}
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className={`flex min-w-0 items-center ${compact ? 'space-x-1.5' : 'space-x-2'}`}>
              {!compact && (
                <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${getTypeColor(task.type)}`}>
                  {getItemIcon(task.type)}
                </div>
              )}
              <h3 className={`truncate font-medium ${compact ? 'text-sm leading-5' : ''} ${
                task.completed ? 'line-through text-gray-500' : 'text-gray-100'
              }`}>
                {task.title}
              </h3>
            </div>

            {/* Menu button */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className={`${compact ? '!h-7 !min-h-0 !w-7 !min-w-0 p-0.5' : 'p-1'} rounded-lg hover:bg-gray-700 cursor-pointer transition-all duration-200 ${showMenu ? 'opacity-100 bg-gray-700' : 'opacity-0 group-hover:opacity-100'}`}
              >
                <MoreVertical className="w-4 h-4 text-gray-400" />
              </button>

              {/* Menu dropdown */}
              {showMenu && (
                <div className="task-menu right-0 top-8 rounded-lg shadow-xl min-w-32">
                  <button
                    onClick={() => {
                      onEdit(task)
                      setShowMenu(false)
                    }}
                    className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer rounded-t-lg"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => {
                      onDelete(task)
                      setShowMenu(false)
                    }}
                    className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-gray-700 cursor-pointer rounded-b-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>
          </div>

                     {/* Category, Project, and Time Info */}
           <div className={`flex min-w-0 items-center overflow-hidden ${compact ? 'mt-1.5 gap-1.5 whitespace-nowrap' : 'mt-2 flex-wrap gap-2'}`}>
             <span className={`shrink-0 rounded-full border text-xs ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'} ${getCategoryColor(task.category)}`}>
               {task.category}
             </span>
             
             {task.project && (
               <span 
                 className={`flex min-w-0 items-center space-x-1 rounded-full border text-xs ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}
                 style={{ 
                   borderColor: `${task.project.color}50`,
                   backgroundColor: `${task.project.color}20`,
                   color: task.project.color
                 }}
               >
                 <Folder className="h-3 w-3 shrink-0" />
                 <span className="truncate">{task.project.name}</span>
               </span>
             )}
            
            {task.startTime && (
              <span className="flex shrink-0 items-center space-x-1 text-xs text-gray-400">
                <Clock className="h-3 w-3" />
                <span>{task.startTime}</span>
              </span>
            )}
            
            {task.duration && (
              <span className="shrink-0 text-xs text-gray-400">
                {task.duration}min
              </span>
            )}

            {task.type === 'task' && task.location && (
              <span className="flex min-w-0 items-center space-x-1 text-xs text-gray-400">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{task.location}</span>
              </span>
            )}

            {task.type === 'habit' && (
              <span className="flex items-center space-x-1 text-xs text-purple-400">
                <Zap className="w-3 h-3" />
                <span>Daily</span>
              </span>
            )}

            {renderGoogleSyncBadge()}
          </div>

          {/* Item-specific details */}
          {renderItemDetails()}

          {/* Rollover indicator */}
          {isRolledOver && task.originalCreatedAt && (
            <div className="flex items-center space-x-1 text-xs text-amber-400 mt-2 bg-amber-500/10 px-2 py-1 rounded-md">
              <Calendar className="w-3 h-3" />
              <span>
                Rolled over from {format(parseISO(task.originalCreatedAt), 'MMM d')}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
