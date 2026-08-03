import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Clock, Check, MoreVertical, Edit, Trash2, Zap, RotateCcw, Calendar,
  ShoppingCart, Utensils, Dumbbell, CheckSquare, Circle, Flame,
  DollarSign, Target, Folder, RefreshCw, AlertTriangle, MapPin
} from 'lucide-react'
import { HabitItem, Task } from '../services/api'
import { format, parseISO } from 'date-fns'
import { getCategoryPresentation } from '../categoryPresentation'
import { Link } from 'react-router-dom'
import { getModulePresentation, moduleHealthHref } from '../modulePresentation'

interface TaskCardProps {
  task: Task
  onComplete: (id: string) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  onUncomplete?: (id: string) => void
  isDragging?: boolean
  className?: string
  compact?: boolean
  onHabitCheckIn?: (habit: HabitItem) => void
}

export default function TaskCard({ task, onComplete, onEdit, onDelete, onUncomplete, onHabitCheckIn, isDragging, className = '', compact = false }: TaskCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const moduleDestination = task.type === 'meal'
    ? moduleHealthHref(getModulePresentation('calories'), task.scheduledDate ?? undefined)
    : task.type === 'workout'
      ? moduleHealthHref(getModulePresentation('workouts'), task.scheduledDate ?? undefined)
      : null
  const planLabel = task.type === 'meal'
    ? 'Meal plan'
    : task.type === 'workout'
      ? 'Workout plan'
      : null

  const handleComplete = () => {
    if (task.type === 'habit' && onHabitCheckIn) {
      onHabitCheckIn(task)
      return
    }
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

  const getCategoryColor = (category: unknown) => getCategoryPresentation(category).className

  const getTypeColor = (type: string) => {
    const colors = {
      habit: 'bg-accent/20 text-accent border-accent/30',
      task: 'bg-accent/20 text-accent border-accent/30',
      grocery: 'bg-state-success/20 text-state-success border-state-success/30',
      meal: 'bg-state-danger/20 text-state-danger border-state-danger/30',
      workout: 'bg-state-warning/20 text-state-warning border-state-warning/30'
    }
    return colors[type as keyof typeof colors] || colors.task
  }

  const renderItemDetails = () => {
    switch (task.type) {
      case 'habit': {
        const info = task.habitInfo ?? { target: null, outcome: task.completed ? 'completed' as const : 'pending' as const, progressTotal: 0 }
        const label = info.outcome === 'failed' ? 'Not done' : info.outcome[0].toUpperCase() + info.outcome.slice(1)
        return (
          <div className={`mt-1 flex min-w-0 items-center gap-2 text-xs ${info.outcome === 'failed' ? 'text-state-danger' : info.outcome === 'partial' ? 'text-state-warning' : info.outcome === 'completed' ? 'text-state-success' : 'text-ink-muted'}`}>
            {info.target && <span className="truncate">{info.progressTotal} / {info.target.value} {info.target.unit === 'minutes' ? 'min' : info.target.unit}</span>}
            <span className="shrink-0">{label}</span>
          </div>
        )
      }
      case 'grocery':
        return (
          <div className="flex items-center space-x-2 text-xs text-ink-muted mt-1">
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
                <span className={`px-2 py-1 rounded-full text-xs ${getCategoryColor('grocery')}`}>
                {task.groceryInfo.groceryCategory}
              </span>
            )}
          </div>
        )
      
      case 'meal':
        return (
          <div className="space-y-1 mt-2">
            <p className="text-xs text-ink-muted">Planned Meal · Calorie entries stay separate</p>
            <div className="flex items-center space-x-2 text-xs text-ink-muted">
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
              <div className="text-xs text-ink-muted truncate">
                {task.mealInfo.ingredients.slice(0, 3).map(ing => ing.name).join(', ')}
                {task.mealInfo.ingredients.length > 3 && '...'}
              </div>
            )}
          </div>
        )
      
      case 'workout':
        return (
          <div className="space-y-1 mt-2">
            <p className="text-xs text-ink-muted">
              {task.workoutInfo?.workoutPlanId ? 'Selected reusable plan' : 'Workout plan unavailable'} · Workout sessions stay separate
            </p>
            <div className="flex items-center space-x-2 text-xs text-ink-muted">
              {task.workoutInfo?.workoutType && (
                <span className={`px-2 py-1 rounded-full text-xs ${getCategoryColor('fitness')}`}>
                  {task.workoutInfo.workoutType}
                </span>
              )}
              {task.workoutInfo?.intensity && (
                <span className={`px-2 py-1 rounded-full text-xs ${
                  task.workoutInfo.intensity === 'high' ? 'bg-state-danger/20 text-state-danger' :
                  task.workoutInfo.intensity === 'medium' ? 'bg-state-warning/20 text-state-warning' :
                  'bg-state-success/20 text-state-success'
                }`}>
                  {task.workoutInfo.intensity}
                </span>
              )}
            </div>
            {task.workoutInfo?.exercises && task.workoutInfo.exercises.length > 0 && (
              <div className="text-xs text-ink-muted">
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
        <span className={`flex items-center space-x-1 rounded-full border border-state-success/30 bg-state-success/15 text-xs text-state-success ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}>
          <Calendar className="w-3 h-3" />
          <span>Synced</span>
        </span>
      )
    }

    if (task.googleSyncStatus === 'failed') {
      return (
        <span className={`flex items-center space-x-1 rounded-full border border-state-danger/30 bg-state-danger/15 text-xs text-state-danger ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}>
          <AlertTriangle className="w-3 h-3" />
          <span>Sync failed</span>
        </span>
      )
    }

    if (task.googleSyncStatus === 'pending') {
      return (
        <span className={`flex items-center space-x-1 rounded-full border border-accent/30 bg-accent/15 text-xs text-accent ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}>
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
      layout={!isDragging}
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: isDragging ? 1.02 : 1,
        boxShadow: isDragging ? '0 20px 40px rgba(0,0,0,0.3)' : '0 4px 8px rgba(0,0,0,0.1)'
      }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={compact ? undefined : { scale: 1.01 }}
      className={`group relative border transition-all duration-300 ${
        compact ? 'flex overflow-visible rounded-lg p-2' : 'rounded-xl p-4'
      } ${
        task.completed 
          ? 'bg-card/50 border-line-strong/50 opacity-75' 
          : 'card glass-effect hover:shadow-lg'
      } ${showMenu ? 'z-[100]' : ''} ${isDragging ? 'z-10 rotate-1' : ''} ${className}`}
      onClick={() => task.type === 'habit' && onHabitCheckIn?.(task)}
    >
      {/* Completion Checkbox */}
      <div className={`flex min-h-0 min-w-0 ${compact ? 'w-full items-center gap-2' : 'items-start space-x-3'}`}>
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); handleComplete() }}
          aria-label={task.type === 'habit' ? `Check in ${task.title}` : task.completed ? 'Uncheck task' : 'Check task'}
          className="-m-3 flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span aria-hidden="true" className={`flex items-center justify-center rounded-full border-2 transition-colors ${compact ? 'h-4 w-4 sm:h-5 sm:w-5' : 'h-5 w-5'} ${task.completed ? 'border-state-success bg-state-success text-on-action' : 'border-line-strong group-hover:border-accent'}`}>
            {task.type === 'habit' ? <RotateCcw className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} /> : task.completed && <Check className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />}
          </span>
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
              <h3 className={`truncate font-medium ${compact ? 'text-sm leading-4' : ''} ${
                task.completed ? 'line-through text-ink-muted' : 'text-ink'
              }`}>
                {task.title}
              </h3>
              {planLabel && (
                <span className={`shrink-0 rounded-full border text-[9px] font-semibold uppercase tracking-wide ${compact ? 'px-1 py-0' : 'px-1.5 py-0.5'} ${getTypeColor(task.type)}`}>
                  {task.completed ? 'Plan done' : planLabel}
                </span>
              )}
            </div>

            {/* Menu button */}
            <div className={`relative flex-shrink-0 ${compact ? 'h-7 w-7' : ''}`}>
              <button
                onClick={(event) => { event.stopPropagation(); setShowMenu(!showMenu) }}
                aria-label={`${task.title} actions`}
                className={`${compact ? 'absolute -right-2 -top-2 !h-11 !min-h-0 !w-11 !min-w-0 p-0.5 sm:static sm:!h-7 sm:!w-7' : 'h-11 w-11 p-1 sm:h-auto sm:w-auto'} flex items-center justify-center rounded-lg hover:bg-raised cursor-pointer transition-all duration-200 ${showMenu ? 'opacity-100 bg-raised' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}
              >
                <MoreVertical className="w-4 h-4 text-ink-muted" />
              </button>

              {/* Menu dropdown */}
              {showMenu && (
                <div className="task-menu right-0 top-8 rounded-lg shadow-xl min-w-32">
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      onEdit(task)
                      setShowMenu(false)
                    }}
                    className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-ink-soft hover:bg-raised cursor-pointer rounded-t-lg"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      onDelete(task)
                      setShowMenu(false)
                    }}
                    className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-state-danger hover:bg-raised cursor-pointer rounded-b-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>
          </div>

                     {/* Category, Project, and Time Info */}
           <div className={`flex min-w-0 items-center overflow-hidden ${compact ? 'mt-0.5 gap-1 whitespace-nowrap leading-4' : 'mt-2 flex-wrap gap-2'}`}>
             <span className={`shrink-0 rounded-full border text-xs ${compact ? 'px-1 py-0 leading-4' : 'px-2 py-1'} ${getCategoryColor(task.category)}`}>
               {getCategoryPresentation(task.category).label}
             </span>
             
             {task.project && (
               <span 
                 className={`flex min-w-0 items-center space-x-1 rounded-full border text-xs ${compact ? 'px-1 py-0 leading-4' : 'px-2 py-1'}`}
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
              <span className="flex shrink-0 items-center space-x-1 text-xs text-ink-muted">
                <Clock className="h-3 w-3" />
                <span>{task.startTime}</span>
              </span>
            )}
            
            {task.duration && (
              <span className="shrink-0 text-xs text-ink-muted">
                {task.duration}min
              </span>
            )}

            {task.type === 'task' && task.location && (
              <span className="flex min-w-0 items-center space-x-1 text-xs text-ink-muted">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{task.location}</span>
              </span>
            )}

            {task.type === 'habit' && (
              <span className="flex items-center space-x-1 text-xs text-accent">
                <Zap className="w-3 h-3" />
                <span>Daily</span>
              </span>
            )}

            {moduleDestination && (
              <Link
                to={moduleDestination}
                onClick={(event) => event.stopPropagation()}
                className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-xs text-accent hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Open {task.type === 'meal' ? 'Nutrition' : 'Workouts'}
              </Link>
            )}

            {renderGoogleSyncBadge()}
          </div>

          {/* Item-specific details */}
          {renderItemDetails()}

          {/* Rollover indicator */}
          {isRolledOver && task.originalCreatedAt && (
            <div className="flex items-center space-x-1 text-xs text-state-warning mt-2 bg-state-warning/10 px-2 py-1 rounded-md">
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
