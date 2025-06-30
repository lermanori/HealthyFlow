import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, Loader2, Mic } from 'lucide-react'
import api from '../services/api'

interface AskAIModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AskAIModal({ isOpen, onClose }: AskAIModalProps) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAsk = async () => {
    if (!question.trim()) return
    setLoading(true)
    setError('')
    setAnswer('')
    try {
      const res = await api.post('/ai/query-tasks', { question })
      setAnswer(res.data.answer)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to get AI answer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-500" /> Ask AI About Your Tasks
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Ask anything about your tasks, e.g. 'What are my most urgent tasks today?'"
                className="input-field min-h-24 resize-none w-full"
                disabled={loading}
                maxLength={300}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{question.length}/300</span>
                <button
                  onClick={handleAsk}
                  disabled={loading || !question.trim()}
                  className="btn-primary flex items-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Ask
                </button>
              </div>
              {error && <div className="text-sm text-red-500">{error}</div>}
              {answer && (
                <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 mt-2 text-gray-800 whitespace-pre-line">
                  {answer}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
} 