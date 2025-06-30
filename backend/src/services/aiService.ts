interface TaskHistory {
  category: string
  completed: boolean
  type: string
  created_at: string
}

interface AIRecommendation {
  id: string
  message: string
  type: 'suggestion' | 'encouragement' | 'tip'
  createdAt: string
}

export class AIService {
  static generateRecommendations(tasks: TaskHistory[]): AIRecommendation[] {
    const recommendations: AIRecommendation[] = []
    const completionRate = tasks.length > 0 ? tasks.filter(t => t.completed).length / tasks.length : 0

    // Analyze completion patterns
    if (completionRate < 0.3) {
      recommendations.push({
        id: this.generateId(),
        message: "Starting small is key! Try focusing on just 2-3 essential tasks today. You've got this! 💪",
        type: 'suggestion',
        createdAt: new Date().toISOString()
      })
    } else if (completionRate > 0.8) {
      recommendations.push({
        id: this.generateId(),
        message: "Amazing work! You're crushing your goals. Consider adding a new challenge to keep growing! 🚀",
        type: 'encouragement',
        createdAt: new Date().toISOString()
      })
    }

    // Category-specific recommendations
    const categories = this.analyzeCategoryPerformance(tasks)
    
    if (categories.health.total === 0) {
      recommendations.push({
        id: this.generateId(),
        message: "Your body is your temple! Try adding a 10-minute walk or drinking an extra glass of water today. 🌱",
        type: 'tip',
        createdAt: new Date().toISOString()
      })
    }

    if (categories.work.completionRate < 0.5 && categories.work.total > 0) {
      recommendations.push({
        id: this.generateId(),
        message: "Try the Pomodoro Technique: 25 minutes focused work, then a 5-minute break. It works wonders! ⏰",
        type: 'suggestion',
        createdAt: new Date().toISOString()
      })
    }

    // Time-based recommendations
    const currentHour = new Date().getHours()
    if (currentHour < 10 && completionRate > 0.6) {
      recommendations.push({
        id: this.generateId(),
        message: "Great morning start! You're setting yourself up for an amazing day. Keep the momentum going! ☀️",
        type: 'encouragement',
        createdAt: new Date().toISOString()
      })
    }

    // Habit formation tips
    const habits = tasks.filter(t => t.type === 'habit')
    if (habits.length > 0) {
      const habitCompletionRate = habits.filter(h => h.completed).length / habits.length
      if (habitCompletionRate < 0.4) {
        recommendations.push({
          id: this.generateId(),
          message: "Habits take time to stick! Try linking new habits to existing routines. For example, meditate right after brushing your teeth. 🧘‍♀️",
          type: 'tip',
          createdAt: new Date().toISOString()
        })
      }
    }

    // Ensure at least one motivational message
    if (recommendations.length === 0) {
      const motivationalMessages = [
        "Every small step counts! You're building something amazing, one task at a time. 🌟",
        "Progress isn't always linear, but you're moving forward. That's what matters! 📈",
        "Your future self will thank you for the effort you're putting in today. Keep going! 💫",
        "Consistency beats perfection every time. You're doing great! 🎯"
      ]
      
      recommendations.push({
        id: this.generateId(),
        message: motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)],
        type: 'encouragement',
        createdAt: new Date().toISOString()
      })
    }

    return recommendations.slice(0, 3) // Limit to 3 recommendations
  }

  private static analyzeCategoryPerformance(tasks: TaskHistory[]) {
    const categories = ['health', 'work', 'personal', 'fitness']
    const analysis: Record<string, { total: number; completed: number; completionRate: number }> = {}

    categories.forEach(category => {
      const categoryTasks = tasks.filter(t => t.category === category)
      const completed = categoryTasks.filter(t => t.completed).length
      analysis[category] = {
        total: categoryTasks.length,
        completed,
        completionRate: categoryTasks.length > 0 ? completed / categoryTasks.length : 0
      }
    })

    return analysis
  }

  private static generateId(): string {
    return Math.random().toString(36).substr(2, 9)
  }

  static generatePersonalizedTips(userPreferences: any): string[] {
    // This would integrate with OpenAI API in a real implementation
    const tips = [
      "Try time-blocking your calendar to create dedicated focus time for important tasks.",
      "Consider the 2-minute rule: if something takes less than 2 minutes, do it immediately.",
      "Use the 'eat the frog' technique: tackle your most challenging task first thing in the morning.",
      "Set up your environment for success by preparing everything you need the night before.",
      "Practice the 80/20 rule: focus on the 20% of tasks that will give you 80% of the results."
    ]

    return tips.slice(0, 2)
  }
}