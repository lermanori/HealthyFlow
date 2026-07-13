import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Brain, Mail, Lock, User, Sparkles, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState(mode === 'login' ? 'demo@healthyflow.com' : '')
  const [password, setPassword] = useState(mode === 'login' ? 'demo123' : '')
  const [name, setName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const { login, signup } = useAuth()

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    const iosStandalone = (window.navigator as any).standalone === true
    setIsStandalone(standalone || iosStandalone)
  }, [])

  // Reset form when switching modes
  const switchMode = (next: 'login' | 'signup') => {
    setMode(next)
    setError('')
    setEmail(next === 'login' ? 'demo@healthyflow.com' : '')
    setPassword(next === 'login' ? 'demo123' : '')
    setName('')
    setConfirmPassword('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters')
        return
      }
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await signup(email, password, name)
      }
      if ('navigator' in window && 'vibrate' in navigator) {
        navigator.vibrate([100, 50, 200])
      }
    } catch (err: any) {
      // Surface inline error for "email already taken" and similar
      const msg = err?.response?.data?.error
      if (msg) setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-4 relative overflow-hidden">
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
              <h1 className="text-2xl md:text-3xl font-bold text-ink neon-text mb-2">
                Welcome to HealthyFlow
              </h1>
              <p className="text-cyan-400 font-medium">AI-Powered Future Planner</p>
              <p className="text-ink-muted text-sm mt-1">Neural networks ready to optimize your life</p>
            </motion.div>

            {/* Mode toggle */}
            <div className="flex mt-4 rounded-xl overflow-hidden border border-line">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'login' ? 'bg-cyan-600 text-white' : 'bg-card text-ink-muted hover:text-ink-soft'}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-cyan-600 text-white' : 'bg-card text-ink-muted hover:text-ink-soft'}`}
              >
                Create account
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-ink-soft mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ink-muted" />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-field pl-12"
                    placeholder="Your name"
                    required
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink-soft mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ink-muted" />
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
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink-soft mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ink-muted" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-12"
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink-soft mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ink-muted" />
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field pl-12"
                    placeholder="Repeat password"
                    required
                    autoComplete="new-password"
                  />
                </div>
              </div>
            )}

            {/* Inline error */}
            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full btn-primary flex items-center justify-center space-x-2 py-4 mt-2"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>{mode === 'login' ? 'Connecting to Neural Network...' : 'Creating account...'}</span>
                </>
              ) : (
                <>
                  <Brain className="w-5 h-5" />
                  <span>{mode === 'login' ? (isStandalone ? 'Login' : 'Initialize AI Session') : 'Create Account'}</span>
                  <Sparkles className="w-4 h-4 animate-neon-flicker" />
                </>
              )}
            </motion.button>
          </form>

          {mode === 'login' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="mt-6 p-4 rounded-xl bg-gradient-to-r from-card/50 to-gray-700/50 border border-line-strong/50"
            >
              <div className="text-center">
                <p className="text-sm text-ink-soft font-medium mb-2">
                  🚀 Demo Access Credentials
                </p>
                <div className="space-y-1 text-xs text-ink-muted">
                  <p><strong className="text-cyan-400">Email:</strong> demo@healthyflow.com</p>
                  <p><strong className="text-cyan-400">Password:</strong> demo123</p>
                </div>
                <Link
                  to="/demo"
                  className="mt-4 inline-flex items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:border-cyan-400/50 hover:bg-cyan-500/15"
                >
                  Try the guided Maya demo
                </Link>
              </div>
            </motion.div>
          )}

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

          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-gray-500">
            <Link to="/privacy" className="transition-colors hover:text-cyan-400">
              Privacy Policy
            </Link>
            <span aria-hidden="true">|</span>
            <Link to="/terms" className="transition-colors hover:text-cyan-400">
              Terms of Service
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
