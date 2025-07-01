import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Brain, Mail, Lock, Sparkles, Zap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'

export default function LoginPage() {
  const [email, setEmail] = useState('demo@healthyflow.com')
  const [password, setPassword] = useState('demo123')
  const [loading, setLoading] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const { login } = useAuth()

  // Check if running in standalone mode (installed PWA)
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    const iosStandalone = (window.navigator as any).standalone === true
    setIsStandalone(standalone || iosStandalone)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      await login(email, password)
      
      // Vibrate on successful login if supported
      if ('navigator' in window && 'vibrate' in navigator) {
        navigator.vibrate([100, 50, 200])
      }
    } catch (error) {
      // Error is handled in AuthContext
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Futuristic background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Animated grid background */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(6, 182, 212, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6, 182, 212, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }}></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="card ai-glow">
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="relative mx-auto mb-4"
            >
              <div className="flex items-center justify-center w-20 h-20 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl animate-float">
                <Brain className="w-10 h-10 text-white" />
              </div>
              <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-cyan-400 animate-neon-flicker" />
              <Zap className="absolute -bottom-1 -left-1 w-5 h-5 text-blue-400 animate-pulse" />
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h1 className="text-2xl md:text-3xl font-bold text-gray-100 neon-text mb-2">
                Welcome to HealthyFlow
              </h1>
              <p className="text-cyan-400 font-medium">AI-Powered Future Planner</p>
              <p className="text-gray-400 text-sm mt-1">Neural networks ready to optimize your life</p>
            </motion.div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-12"
                  placeholder="Enter your email"
                  required
                  autoComplete="email"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
            >
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-12"
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
              </div>
            </motion.div>

            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full btn-primary flex items-center justify-center space-x-2 py-4"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Connecting to Neural Network...</span>
                </>
              ) : (
                <>
                  <Brain className="w-5 h-5" />
                  <span>{isStandalone ? 'Login' : 'Initialize AI Session'}</span>
                  <Sparkles className="w-4 h-4 animate-neon-flicker" />
                </>
              )}
            </motion.button>
          </form>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-6 p-4 rounded-xl bg-gradient-to-r from-gray-800/50 to-gray-700/50 border border-gray-600/50"
          >
            <div className="text-center">
              <p className="text-sm text-gray-300 font-medium mb-2">
                🚀 Demo Access Credentials
              </p>
              <div className="space-y-1 text-xs text-gray-400">
                <p><strong className="text-cyan-400">Email:</strong> demo@healthyflow.com</p>
                <p><strong className="text-cyan-400">Password:</strong> demo123</p>
              </div>
            </div>
          </motion.div>
          
          {/* PWA Status Indicator */}
          {isStandalone && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-4 p-3 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30"
            >
              <div className="flex items-center justify-center space-x-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <p className="text-xs text-cyan-400">Running as installed app</p>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  )
}