# HealthyFlow Features Overview

A high-level summary of the main features in the HealthyFlow project, with short descriptions for each.

---

## 1. Task Management
- **Create, edit, and delete tasks**: Users can add, update, and remove tasks for any day.
- **Categories & types**: Tasks can be categorized (work, personal, health, etc.) and typed (task or habit).
- **Scheduling**: Tasks can be scheduled for specific dates and times, or left as "floating" (unscheduled).

## 2. Rollover of Floating Tasks
- **Automatic rollover**: Incomplete floating tasks (no start time or date) are automatically moved to the current day.
- **Original date tracking**: Rolled over tasks display their original creation date ("Rolled over from Jul 3").
- **Duplicate prevention**: Prevents the same floating task from being rolled over multiple times per day.

## 3. Habits & Recurring Tasks
- **Daily/weekly habits**: Users can create habits that repeat daily or weekly.
- **Virtual habit instances**: Habits are shown as virtual tasks for each day, and become real tasks when completed.
- **Streak tracking**: Habit completion streaks are tracked and visualized.

## 4. AI Features
- **AI recommendations**: Users receive personalized suggestions, encouragement, and tips from the AI.
- **AI text analyzer**: Analyze task descriptions for productivity insights.
- **Ask AI modal**: Users can ask questions and get AI-powered responses.

## 5. Analytics & Progress
- **Weekly summary**: Visual summary of completed vs. total tasks and habits.
- **Category breakdown**: See stats by category (work, health, etc.).
- **Time distribution**: Analyze how time is spent across categories.

## 6. Notifications & Reminders
- **Overdue notifications**: Users are notified of overdue tasks.
- **Smart reminders**: Context-aware reminders for important tasks.
- **Offline support**: Notifications work even when offline (PWA).

## 7. PWA & Mobile Support
- **Progressive Web App**: Installable on mobile and desktop, with offline support.
- **Responsive design**: Optimized for all screen sizes.
- **Add to Home Screen prompt**: Encourages users to install the app.

## 8. Voice & Accessibility
- **Voice input**: Add and edit tasks using voice commands.
- **Text-to-speech (TTS)**: Listen to tasks and reminders.
- **Speech-to-text (STT)**: Dictate tasks and notes.

## 9. Admin & Demo Tools
- **Admin panel**: Manage users and data (for admins only).
- **Demo user**: Preloaded demo account for easy onboarding/testing.

## 10. Data & Security
- **Supabase backend**: Secure, scalable cloud database.
- **Authentication**: User accounts with secure login.
- **Role-based access**: Admin/user separation for sensitive features.

---

*This document provides a high-level overview. For technical details, see the codebase and README files.* 