import { motion } from 'framer-motion'
import { Clock, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import type { TaskSuggestion } from '../../lib/ai/parseTasksSchema'
import { getPriorityColor, getCategoryColor, getDateColor, getDateLabel } from './utils'

interface SuggestionCardProps {
  suggestion: TaskSuggestion
  isSelected: boolean
  onToggle: () => void
  onUpdateDate: (date: string) => void
  quickDates: Array<{ label: string; value: string }>
  ttsEnabled: boolean
  onSpeakDetails: () => void
}

export default function SuggestionCard({
  suggestion,
  isSelected,
  onToggle,
  onUpdateDate,
  quickDates,
  ttsEnabled,
  onSpeakDetails,
}: SuggestionCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`task-suggestion cursor-pointer ${isSelected ? 'ring-2 ring-cyan-400' : ''}`}
      onClick={onToggle}
    >
      <div className="flex items-start space-x-3">
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-all ${
          isSelected ? 'bg-cyan-500 border-cyan-500' : 'border-gray-500 hover:border-cyan-400'
        }`}>
          {isSelected && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="w-2 h-2 bg-white rounded-full"
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-100 mb-2">{suggestion.title}</h4>

          <div className="flex flex-wrap gap-2 mb-3">
            <span className={`px-2 py-1 rounded-full text-xs border ${getCategoryColor(suggestion.category)}`}>
              {suggestion.category}
            </span>
            <span className={`px-2 py-1 rounded-full text-xs border ${getPriorityColor(suggestion.priority)}`}>
              {suggestion.priority} priority
            </span>
            <span className="px-2 py-1 rounded-full text-xs bg-gray-500/20 text-gray-400 border border-gray-500/30">
              {suggestion.estimatedDuration}min
            </span>
            <span className="px-2 py-1 rounded-full text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30">
              {suggestion.type}
            </span>
            {suggestion.startTime && (
              <span className="px-2 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <Clock className="w-3 h-3 inline mr-1" />
                {suggestion.startTime}
              </span>
            )}
            <span className={`px-2 py-1 rounded-full text-xs border ${getDateColor(suggestion.scheduledDate)}`}>
              <Calendar className="w-3 h-3 inline mr-1" />
              {getDateLabel(suggestion.scheduledDate)}
            </span>
          </div>

          <div className="mb-3">
            <label className="text-xs text-gray-400 block mb-1">Schedule for:</label>
            <div className="flex items-center space-x-2">
              <input
                type="date"
                value={suggestion.scheduledDate}
                onChange={(e) => {
                  e.stopPropagation()
                  onUpdateDate(e.target.value)
                }}
                className="input-field text-xs py-1 px-2 w-auto"
                min={format(new Date(), 'yyyy-MM-dd')}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex space-x-1">
                {quickDates.slice(0, 2).map((date) => (
                  <button
                    key={date.label}
                    onClick={(e) => {
                      e.stopPropagation()
                      onUpdateDate(date.value)
                    }}
                    className={`px-2 py-1 rounded text-xs transition-all ${
                      suggestion.scheduledDate === date.value
                        ? 'bg-cyan-500 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {date.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {ttsEnabled && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSpeakDetails()
              }}
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              🔊 Speak details
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
