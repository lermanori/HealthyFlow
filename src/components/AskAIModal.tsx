import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, Loader2, Brain } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { taskService } from '../services/api'
import { format } from 'date-fns'

interface AskAIModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AskAIModal({ isOpen, onClose }: AskAIModalProps) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Get user's tasks for context
  const { data: todayTasks = [] } = useQuery({
    queryKey: ['tasks', format(new Date(), 'yyyy-MM-dd')],
    queryFn: () => taskService.getTasks(format(new Date(), 'yyyy-MM-dd')),
    enabled: isOpen
  })

  const analyzeTasksWithAI = (question: string, tasks: any[]) => {
    const lowerQuestion = question.toLowerCase()
    
    // Task completion analysis
    if (lowerQuestion.includes('done') || lowerQuestion.includes('complete') || lowerQuestion.includes('finish')) {
      const completedTasks = tasks.filter(t => t.completed)
      const pendingTasks = tasks.filter(t => !t.completed)
      
      if (lowerQuestion.includes('now') || lowerQuestion.includes('urgent') || lowerQuestion.includes('priority')) {
        const urgentTasks = pendingTasks.filter(t => {
          if (!t.startTime) return false
          
          const taskTime = new Date(`2000-01-01T${t.startTime}`)
          const currentTime = new Date()
          const taskMinutes = taskTime.getHours() * 60 + taskTime.getMinutes()
          const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()
          return Math.abs(taskMinutes - currentMinutes) <= 60 // Within 1 hour
        })
        
        if (urgentTasks.length > 0) {
          return `🚨 **Urgent Tasks Right Now:**\n\n${urgentTasks.map(t => 
            `• **${t.title}** (${t.category}) - Scheduled for ${t.startTime || 'flexible time'}`
          ).join('\n')}\n\n💡 **Recommendation:** Focus on these time-sensitive tasks first. You can tackle them in ${urgentTasks.reduce((sum, t) => sum + (t.duration || 30), 0)} minutes total.`
        } else {
          const nextTasks = pendingTasks.slice(0, 3)
          return `✅ **No urgent tasks right now!** Here's what you can work on next:\n\n${nextTasks.map(t => 
            `• **${t.title}** (${t.category}) - ${t.duration || 30} minutes`
          ).join('\n')}\n\n🎯 **Tip:** Pick the one that matches your current energy level!`
        }
      }
      
      return `📊 **Task Completion Status:**\n\n✅ **Completed:** ${completedTasks.length} tasks\n⏳ **Remaining:** ${pendingTasks.length} tasks\n📈 **Progress:** ${Math.round((completedTasks.length / tasks.length) * 100)}%\n\n${pendingTasks.length > 0 ? 
        `🎯 **Next up:** ${pendingTasks[0]?.title || 'No pending tasks'}` : 
        '🎉 **Amazing! All tasks completed!**'}`
    }
    
    // Time and schedule analysis
    if (lowerQuestion.includes('time') || lowerQuestion.includes('schedule') || lowerQuestion.includes('when')) {
      const scheduledTasks = tasks.filter(t => t.startTime && !t.completed)
      if (scheduledTasks.length === 0) {
        return `⏰ **Schedule Analysis:**\n\nYou have ${tasks.filter(t => !t.completed).length} unscheduled tasks. Consider adding time blocks to:\n\n${tasks.filter(t => !t.completed && !t.startTime).slice(0, 3).map(t => 
          `• ${t.title} (${t.duration || 30} min)`
        ).join('\n')}\n\n💡 **Tip:** Time-blocking increases productivity by 25%!`
      }
      
      const sortedTasks = scheduledTasks.sort((a, b) => a.startTime.localeCompare(b.startTime))
      return `📅 **Your Schedule:**\n\n${sortedTasks.map(t => 
        `${t.startTime} - **${t.title}** (${t.duration || 30} min)`
      ).join('\n')}\n\n⚡ **Total scheduled time:** ${sortedTasks.reduce((sum, t) => sum + (t.duration || 30), 0)} minutes`
    }
    
    // Category analysis
    if (lowerQuestion.includes('category') || lowerQuestion.includes('type') || lowerQuestion.includes('health') || lowerQuestion.includes('work') || lowerQuestion.includes('fitness')) {
      const categories = tasks.reduce((acc, task) => {
        if (!acc[task.category]) acc[task.category] = { total: 0, completed: 0 }
        acc[task.category].total++
        if (task.completed) acc[task.category].completed++
        return acc
      }, {})
      
      return `📊 **Category Breakdown:**\n\n${Object.entries(categories).map(([cat, stats]: [string, any]) => 
        `**${cat.charAt(0).toUpperCase() + cat.slice(1)}:** ${stats.completed}/${stats.total} (${Math.round((stats.completed/stats.total)*100)}%)`
      ).join('\n')}\n\n🎯 **Focus Area:** ${Object.entries(categories).sort(([,a]: [string, any], [,b]: [string, any]) => 
        (a.completed/a.total) - (b.completed/b.total))[0]?.[0] || 'All balanced!'}`
    }
    
    // Productivity and motivation
    if (lowerQuestion.includes('productive') || lowerQuestion.includes('motivation') || lowerQuestion.includes('energy')) {
      const completionRate = tasks.length > 0 ? (tasks.filter(t => t.completed).length / tasks.length) * 100 : 0
      
      if (completionRate >= 80) {
        return `🚀 **You're crushing it!** ${Math.round(completionRate)}% completion rate!\n\n🌟 **Momentum Tips:**\n• Celebrate this win - you've earned it!\n• Consider adding a challenging stretch goal\n• Share your success with someone\n\n💪 **You're in the zone - keep the energy flowing!**`
      } else if (completionRate >= 50) {
        return `⚡ **Solid progress!** You're at ${Math.round(completionRate)}% completion.\n\n🎯 **Boost Strategies:**\n• Try the 2-minute rule for quick wins\n• Take a 5-minute energizing break\n• Tackle your easiest remaining task first\n\n🔥 **You're building great momentum!**`
      } else {
        return `💪 **Fresh start energy!** Every expert was once a beginner.\n\n🌱 **Gentle Restart:**\n• Pick just ONE small task to begin\n• Set a 15-minute timer and start\n• Remember: progress > perfection\n\n✨ **You've got this - one step at a time!**`
      }
    }
    
    // Habits and routines
    if (lowerQuestion.includes('habit') || lowerQuestion.includes('routine') || lowerQuestion.includes('daily')) {
      const habits = tasks.filter(t => t.type === 'habit')
      const completedHabits = habits.filter(t => t.completed)
      
      return `🔄 **Habit Tracking:**\n\n📈 **Today's Habits:** ${completedHabits.length}/${habits.length} completed\n\n${habits.map(h => 
        `${h.completed ? '✅' : '⏳'} **${h.title}** (${h.category})`
      ).join('\n')}\n\n💡 **Habit Tip:** ${habits.length > completedHabits.length ? 
        'Stack your next habit with something you already do!' : 
        'Perfect habit day! Consider adding one new micro-habit.'}`
    }
    
    // Default intelligent response
    return `🤖 **AI Analysis:**\n\nBased on your ${tasks.length} tasks, here's what I see:\n\n📊 **Quick Stats:**\n• ${tasks.filter(t => t.completed).length} completed, ${tasks.filter(t => !t.completed).length} remaining\n• ${tasks.filter(t => t.type === 'habit').length} habits, ${tasks.filter(t => t.type === 'task').length} tasks\n• ${Object.keys(tasks.reduce((acc, t) => ({...acc, [t.category]: true}), {})).length} different categories\n\n💡 **Smart Suggestion:** ${tasks.filter(t => !t.completed).length > 0 ? 
      `Focus on "${tasks.filter(t => !t.completed)[0]?.title}" next - it's your top priority!` : 
      'All done! Time to plan tomorrow or take a well-deserved break! 🎉'}`
  }

  const handleAsk = async () => {
    if (!question.trim()) return
    setLoading(true)
    setError('')
    setAnswer('')
    
    try {
      const openaiKey = localStorage.getItem('openai_api_key')
      
      if (openaiKey) {
        // Use OpenAI API for enhanced responses
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: `You are a helpful AI productivity assistant for HealthyFlow. Analyze the user's tasks and provide actionable, encouraging advice. Be concise but insightful. Use emojis and formatting to make responses engaging. Focus on productivity, time management, and motivation.

Current user tasks: ${JSON.stringify(todayTasks, null, 2)}

Provide specific, actionable advice based on their actual tasks and schedule.`
              },
              {
                role: 'user',
                content: question
              }
            ],
            temperature: 0.7,
            max_tokens: 300
          })
        })

        if (!response.ok) {
          throw new Error('OpenAI API request failed')
        }

        const data = await response.json()
        setAnswer(data.choices[0]?.message?.content || 'No response generated.')
      } else {
        // Use local AI analysis
        const intelligentAnswer = analyzeTasksWithAI(question, todayTasks)
        setAnswer(intelligentAnswer)
      }
    } catch (e: any) {
      console.error('AI Analysis error:', e)
      // Fallback to local analysis
      const fallbackAnswer = analyzeTasksWithAI(question, todayTasks)
      setAnswer(fallbackAnswer)
    } finally {
      setLoading(false)
    }
  }

  const quickQuestions = [
    "What should I focus on right now?",
    "How am I doing with my habits today?",
    "What's my most urgent task?",
    "How can I be more productive?",
    "What's my completion rate today?"
  ]

  const handleQuickQuestion = (q: string) => {
    setQuestion(q)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative card ai-glow w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center animate-float">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-lg font-semibold text-gray-100 neon-text">Ask AI About Your Tasks</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-700 transition-colors text-gray-400 hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pb-28 md:pb-0 modal-content">
              {/* Quick Questions */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">Quick Questions:</h3>
                <div className="flex flex-wrap gap-2">
                  {quickQuestions.map((q, index) => (
                    <button
                      key={index}
                      onClick={() => handleQuickQuestion(q)}
                      className="text-xs px-3 py-1 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-cyan-400 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question Input */}
              <div>
                <textarea
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="Ask anything about your tasks, productivity, or schedule..."
                  className="input-field min-h-24 resize-none w-full text-gray-100 placeholder-gray-400"
                  disabled={loading}
                  maxLength={300}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleAsk()
                    }
                  }}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-400">{question.length}/300</span>
                  <button
                    onClick={handleAsk}
                    disabled={loading || !question.trim()}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Ask
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Answer Display */}
              {answer && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30"
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Brain className="w-3 h-3 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-200 whitespace-pre-line leading-relaxed">
                        {answer}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Context Info */}
              <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                <div className="flex items-center space-x-2 text-xs text-gray-400">
                  <Brain className="w-3 h-3" />
                  <span>
                    Analyzing {todayTasks.length} tasks • 
                    {todayTasks.filter(t => t.completed).length} completed • 
                    {localStorage.getItem('openai_api_key') ? 'AI Enhanced' : 'Smart Analysis'}
                  </span>
                </div>
              </div>
            </div>

            {/* Fixed position buttons for mobile */}
            <div className="fixed bottom-28 left-0 right-0 p-4 bg-gray-900/95 backdrop-blur-xl border-t border-gray-700/50 z-30 md:hidden">
              <button
                onClick={onClose}
                className="btn-secondary w-full"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}