import { motion, AnimatePresence } from 'framer-motion'
import { Wifi, WifiOff } from 'lucide-react'
import { useOfflineStatus } from '../hooks/useOfflineStatus'

export default function OfflineNotification() {
  const { isOffline, reconnected } = useOfflineStatus()

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-0 left-0 right-0 z-50 bg-red-500 text-white p-3 flex items-center justify-center"
        >
          <WifiOff className="w-4 h-4 mr-2" />
          <span className="text-sm font-medium">You're offline. Some features may be limited.</span>
        </motion.div>
      )}
      
      {reconnected && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-0 left-0 right-0 z-50 bg-green-500 text-white p-3 flex items-center justify-center"
        >
          <Wifi className="w-4 h-4 mr-2" />
          <span className="text-sm font-medium">You're back online! Syncing data...</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}