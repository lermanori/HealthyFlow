import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, CalendarClock, HeartPulse, Utensils, X, Sparkles } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { aiService, type DailySignal } from '../services/api'
import LoadingSpinner from './LoadingSpinner'

type AIRecommendationsBoxProps = {
  date: string
}

export default function AIRecommendationsBox({ date }: AIRecommendationsBoxProps) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([])

  const { data: dailyContext, isLoading, isError } = useQuery({
    queryKey: ['daily-context', date],
    queryFn: () => aiService.getDailyContext(date),
    retry: false,
  })

  const visibleSignals = dailyContext?.signals.filter(
    signal => !dismissedIds.includes(signal.id)
  ) || []

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => [...prev, id])
    
    // Vibrate on dismiss if supported
    if ('navigator' in window && 'vibrate' in navigator) {
      navigator.vibrate(50)
    }
  }

  const getIcon = (type: DailySignal['type']) => {
    switch (type) {
      case 'schedule_overload':
        return <CalendarClock className="w-5 h-5" />
      case 'habit_risk':
        return <HeartPulse className="w-5 h-5" />
      case 'missing_calorie_log':
        return <Utensils className="w-5 h-5" />
      default:
        return <Brain className="w-5 h-5" />
    }
  }

  const getColors = (severity: DailySignal['severity']) => {
    switch (severity) {
      case 'high':
        return 'bg-red-500/15 border-red-500/30 text-red-300'
      case 'medium':
        return 'bg-amber-500/15 border-amber-500/30 text-amber-300'
      case 'low':
        return 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
      default:
        return 'bg-gray-500/20 border-gray-500/30 text-ink-soft'
    }
  }

  if (isLoading) {
    return (
      <div className="card ai-glow">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center animate-float">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ink neon-text">AI Insights</h3>
            <p className="text-xs text-cyan-400">Analyzing your patterns...</p>
          </div>
        </div>
        <div className="mt-4 flex justify-center">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="card holographic">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center animate-float">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ink neon-text">AI Insights</h3>
            <p className="text-xs text-cyan-400">Daily signals unavailable</p>
          </div>
        </div>
        <div className="mt-4 p-4 rounded-xl bg-card/30 border border-line/50">
          <p className="text-ink-muted text-sm text-center">
            Could not load today's signals.
          </p>
        </div>
      </div>
    )
  }

  if (visibleSignals.length === 0) {
    return (
      <div className="card holographic">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center animate-float">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ink neon-text">AI Insights</h3>
            <p className="text-xs text-cyan-400">Daily signals ready</p>
          </div>
        </div>
        <div className="mt-4 p-4 rounded-xl bg-card/30 border border-line/50">
          <p className="text-ink-muted text-sm text-center">
            No urgent signals for this day.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card ai-glow">
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center animate-float">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-ink neon-text">AI Insights</h3>
          <p className="text-xs text-cyan-400">Daily signals</p>
        </div>
        <Sparkles className="w-4 h-4 text-cyan-400 animate-neon-flicker ml-auto" />
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {visibleSignals.map((signal, index) => (
            <motion.div
              key={signal.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ delay: index * 0.1 }}
              className={`p-4 rounded-xl border relative overflow-hidden ${getColors(signal.severity)}`}
            >
              {/* Animated background effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse"></div>
              
              <button
                onClick={() => handleDismiss(signal.id)}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-black/20 transition-colors z-10"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start space-x-3 pr-6 relative z-10">
                <div className="flex-shrink-0 mt-0.5">
                  {getIcon(signal.type)}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium leading-relaxed">
                    {signal.summary}
                  </p>
                  {signal.suggestedAction && (
                    <p className="text-xs opacity-90">
                      {signal.suggestedAction.label}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
