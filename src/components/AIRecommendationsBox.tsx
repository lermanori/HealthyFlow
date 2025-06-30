import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Lightbulb, Heart, TrendingUp, X, Sparkles } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { aiService, AIRecommendation } from '../services/api'
import LoadingSpinner from './LoadingSpinner'

export default function AIRecommendationsBox() {
  const [dismissedIds, setDismissedIds] = useState<string[]>([])

  const { data: recommendations, isLoading } = useQuery({
    queryKey: ['ai-recommendations'],
    queryFn: aiService.getRecommendations,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  })

  const visibleRecommendations = recommendations?.filter(
    rec => !dismissedIds.includes(rec.id)
  ) || []

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => [...prev, id])
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'suggestion':
        return <Lightbulb className="w-5 h-5" />
      case 'encouragement':
        return <Heart className="w-5 h-5" />
      case 'tip':
        return <TrendingUp className="w-5 h-5" />
      default:
        return <Brain className="w-5 h-5" />
    }
  }

  const getColors = (type: string) => {
    switch (type) {
      case 'suggestion':
        return 'bg-blue-500/20 border-blue-500/30 text-blue-400'
      case 'encouragement':
        return 'bg-green-500/20 border-green-500/30 text-green-400'
      case 'tip':
        return 'bg-purple-500/20 border-purple-500/30 text-purple-400'
      default:
        return 'bg-gray-500/20 border-gray-500/30 text-gray-400'
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
            <h3 className="text-lg font-semibold text-gray-100 neon-text">AI Insights</h3>
            <p className="text-xs text-cyan-400">Analyzing your patterns...</p>
          </div>
        </div>
        <div className="mt-4 flex justify-center">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  if (visibleRecommendations.length === 0) {
    return (
      <div className="card holographic">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center animate-float">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-100 neon-text">AI Insights</h3>
            <p className="text-xs text-cyan-400">Neural network ready</p>
          </div>
        </div>
        <div className="mt-4 p-4 rounded-xl bg-gray-800/30 border border-gray-700/50">
          <p className="text-gray-400 text-sm text-center">
            Complete more tasks to unlock personalized AI recommendations! 🚀
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
          <h3 className="text-lg font-semibold text-gray-100 neon-text">AI Insights</h3>
          <p className="text-xs text-cyan-400">Powered by neural networks</p>
        </div>
        <Sparkles className="w-4 h-4 text-cyan-400 animate-neon-flicker ml-auto" />
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {visibleRecommendations.map((recommendation, index) => (
            <motion.div
              key={recommendation.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ delay: index * 0.1 }}
              className={`p-4 rounded-xl border relative overflow-hidden ${getColors(recommendation.type)}`}
            >
              {/* Animated background effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse"></div>
              
              <button
                onClick={() => handleDismiss(recommendation.id)}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-black/20 transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start space-x-3 pr-6 relative z-10">
                <div className="flex-shrink-0 mt-0.5">
                  {getIcon(recommendation.type)}
                </div>
                <div>
                  <p className="text-sm font-medium leading-relaxed">
                    {recommendation.message}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}