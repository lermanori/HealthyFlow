import { motion } from 'framer-motion'

interface HabitTrackerBarProps {
  title: string
  completed: number
  total: number
  color?: string
}

export default function HabitTrackerBar({ title, completed, total, color = 'bg-gradient-to-r from-cyan-500 to-blue-600' }: HabitTrackerBarProps) {
  const percentage = total > 0 ? (completed / total) * 100 : 0

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium text-gray-200">{title}</h4>
        <span className="text-sm text-gray-400">{completed}/{total}</span>
      </div>
      
      <div className="relative">
        <div className="w-full bg-gray-700/50 rounded-full h-3 overflow-hidden">
          <motion.div
            className={`h-3 rounded-full ${color} relative overflow-hidden`}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            {/* Animated shine effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
          </motion.div>
        </div>
        
        {/* Glow effect */}
        <motion.div
          className={`absolute top-0 h-3 rounded-full ${color} opacity-50 blur-sm`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
        />
      </div>
      
      <div className="flex justify-between items-center text-xs">
        <span className="text-gray-500">
          {percentage.toFixed(0)}% complete
        </span>
        {percentage === 100 && (
          <motion.span
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-cyan-400 font-medium"
          >
            ✨ Perfect!
          </motion.span>
        )}
      </div>
    </div>
  )
}