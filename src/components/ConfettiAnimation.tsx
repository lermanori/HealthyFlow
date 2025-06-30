import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ConfettiAnimationProps {
  show: boolean
  onComplete: () => void
}

export default function ConfettiAnimation({ show, onComplete }: ConfettiAnimationProps) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; color: string; rotation: number }>>([])

  useEffect(() => {
    if (show) {
      const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
      const newParticles = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
      }))
      setParticles(newParticles)

      const timer = setTimeout(() => {
        onComplete()
      }, 2000)

      return () => clearTimeout(timer)
    }
  }, [show, onComplete])

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              initial={{
                x: '50vw',
                y: '50vh',
                scale: 0,
                rotate: 0,
              }}
              animate={{
                x: `${particle.x}vw`,
                y: `${particle.y}vh`,
                scale: [0, 1, 0],
                rotate: particle.rotation,
              }}
              exit={{
                opacity: 0,
              }}
              transition={{
                duration: 2,
                ease: 'easeOut',
              }}
              className="absolute w-3 h-3 rounded-full"
              style={{ backgroundColor: particle.color }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  )
}