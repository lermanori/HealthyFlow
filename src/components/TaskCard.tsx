import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Clock, Check, MoreVertical, Edit, Trash2, Zap, RotateCcw, Calendar,
  ShoppingCart, Utensils, Dumbbell, CheckSquare, Circle, Flame,
  DollarSign, Target, Folder
} from 'lucide-react'
import { Task } from '../services/api'
import { format, parseISO } from 'date-fns'

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
      className={`group relative p-4 rounded-xl border transition-all duration-300 ${
        task.completed 
          ? 'bg-gray-800/50 border-gray-600/50 opacity-75' 
          : 'card glass-effect hover:shadow-lg'
      } ${isDragging ? 'z-10 rotate-1' : ''}`}
    >
      {/* Completion Checkbox */}
      <div className="flex items-start space-x-3">
        <button
          onClick={handleComplete}
          className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
            task.completed
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 border-green-500 text-white'
              : 'border-gray-600 hover:border-cyan-400 hover:bg-cyan-400/10'
          }`}
        >
          {task.completed && <Check className="w-3 h-3" />}
        </button>

        <div className="flex-1 min-w-0">
          {/* Header with title and type */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 min-w-0">
              <div className={`flex items-center justify-center w-6 h-6 rounded-lg ${getTypeColor(task.type)}`}>
                {getItemIcon(task.type)}
              </div>
              <h3 className={`font-medium truncate ${
                task.completed ? 'line-through text-gray-500' : 'text-gray-100'
              }`}>
                {task.title}
              </h3>
            </div>

            {/* Menu button */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-700 transition-all duration-200"
              >
                <MoreVertical className="w-4 h-4 text-gray-400" />
              </button>

              {/* Menu dropdown */}
              {showMenu && (
                <div className="absolute right-0 top-8 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 min-w-32">
                  <button
                    onClick={() => {
                      onEdit(task)
                      setShowMenu(false)
                    }}
                    className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-t-lg"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => {
                      onDelete(task.id)
                      setShowMenu(false)
                    }}
                    className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-gray-700 rounded-b-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>
          </div>

                     {/* Category, Project, and Time Info */}
           <div className="flex items-center space-x-2 mt-2 flex-wrap">
             <span className={`px-2 py-1 rounded-full text-xs border ${getCategoryColor(task.category)}`}>
               {task.category}
             </span>
             
             {task.project && (
               <span 
                 className="flex items-center space-x-1 px-2 py-1 rounded-full text-xs border"
                 style={{ 
                   borderColor: `${task.project.color}50`,
                   backgroundColor: `${task.project.color}20`,
                   color: task.project.color
                 }}
               >
                 <Folder className="w-3 h-3" />
                 <span>{task.project.name}</span>
               </span>
             )}
            
            {task.startTime && (
              <span className="flex items-center space-x-1 text-xs text-gray-400">
                <Clock className="w-3 h-3" />
                <span>{task.startTime}</span>
              </span>
            )}
            
            {task.duration && (
              <span className="text-xs text-gray-400">
                {task.duration}min
              </span>
            )}

            {task.type === 'habit' && (
              <span className="flex items-center space-x-1 text-xs text-purple-400">
                <Zap className="w-3 h-3" />
                <span>Daily</span>
              </span>
            )}
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