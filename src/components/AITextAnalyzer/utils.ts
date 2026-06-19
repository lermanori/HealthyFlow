import { format, addDays } from 'date-fns'

export const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high': return 'text-red-400 bg-red-500/20 border-red-500/30'
    case 'medium': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30'
    case 'low': return 'text-green-400 bg-green-500/20 border-green-500/30'
    default: return 'text-gray-400 bg-gray-500/20 border-gray-500/30'
  }
}

export const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    health: 'bg-green-500/20 text-green-400 border-green-500/30',
    work: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    personal: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    fitness: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  }
  return colors[category] ?? colors.personal
}

export const getDateLabel = (date: string) => {
  const today = format(new Date(), 'yyyy-MM-dd')
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  if (date === today) return 'Today'
  if (date === tomorrow) return 'Tomorrow'
  return format(new Date(date), 'MMM d')
}

export const getDateColor = (date: string) => {
  const today = format(new Date(), 'yyyy-MM-dd')
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  if (date === today) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
  if (date === tomorrow) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
}
