import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { TrendingUp, Sparkles } from 'lucide-react'

interface WeeklyProgressChartProps {
  data: Array<{
    date: Date
    completed: number
    total: number
  }>
}

export default function WeeklyProgressChart({ data }: WeeklyProgressChartProps) {
  const maxTotal = Math.max(...data.map(d => d.total), 1)

  return (
    <div className="card ai-glow">
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-6 h-6 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
          <TrendingUp className="w-3 h-3 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-ink">Weekly Progress</h3>
        <Sparkles className="w-4 h-4 text-cyan-400 animate-neon-flicker" />
      </div>
      
      <div className="space-y-4">
        {data.map((day, index) => {
          const completionRate = day.total > 0 ? (day.completed / day.total) * 100 : 0
          const heightPercentage = day.total > 0 ? (day.total / maxTotal) * 100 : 0
          
          return (
            <div key={day.date.toISOString()} className="flex items-end space-x-3">
              <div className="w-12 text-xs text-ink-muted text-center font-medium">
                {format(day.date, 'EEE')}
              </div>
              
              <div className="flex-1 relative">
                <div className="flex items-end space-x-1">
                  {/* Total tasks bar */}
                  <div 
                    className="relative bg-gray-700/50 rounded-t w-8 border border-line-strong/50" 
                    style={{ height: `${Math.max(heightPercentage, 20)}px` }}
                  >
                    {/* Completed tasks overlay */}
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${completionRate}%` }}
                      transition={{ delay: index * 0.1, duration: 0.5 }}
                      className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-cyan-500 to-blue-600 rounded-t"
                    />
                    
                    {/* Glow effect */}
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: `${completionRate}%`, opacity: 0.5 }}
                      transition={{ delay: index * 0.1, duration: 0.5 }}
                      className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-cyan-400 to-blue-500 rounded-t blur-sm"
                    />
                  </div>
                  
                  <div className="text-xs text-ink-soft font-medium">
                    {day.completed}/{day.total}
                  </div>
                </div>
              </div>
              
              <div className="w-12 text-xs text-ink-muted text-right font-medium">
                {Math.round(completionRate)}%
              </div>
            </div>
          )
        })}
      </div>
      
      <div className="mt-6 flex items-center justify-between text-xs text-gray-500 pt-4 border-t border-line/50">
        <span className="text-ink-muted font-medium">This Week</span>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-gray-700 rounded border border-line-strong"></div>
            <span className="text-ink-muted">Total</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded"></div>
            <span className="text-ink-muted">Completed</span>
          </div>
        </div>
      </div>
    </div>
  )
}