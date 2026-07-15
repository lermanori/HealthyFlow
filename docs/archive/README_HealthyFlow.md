# 🧠 HealthyFlow – Full-Stack Architecture & Task Plan

## 📐 Part 1: Software Architecture Document

---

### 🗂 Folder Structure

#### Frontend (React + Vite)
```
/frontend
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── services/
│   ├── context/
│   ├── utils/
│   ├── App.tsx
│   ├── main.tsx
│   └── routes.tsx
├── vite.config.ts
└── package.json
```

#### Backend (Express + Node.js)
```
/backend
├── src/
│   ├── controllers/
│   ├── routes/
│   ├── models/
│   ├── services/
│   ├── middleware/
│   ├── utils/
│   ├── db/
│   └── index.ts
├── .env
├── tsconfig.json
└── package.json
```

---

### 🔁 Key User Flows & Business Logic

#### Flow: Daily Routine Scheduling
1. User logs in
2. App fetches user's tasks + healthy habits
3. AI suggests a daily plan using current data + free calendar slots
4. User can drag & drop items to adjust
5. Completion of each item is logged

#### Flow: AI Recommendations
- Backend sends user history to OpenAI API
- Receives suggestions: e.g., “try going to bed earlier”
- Suggestions are stored in NoSQL (unstructured feedback)

#### Flow: Task/Habit Completion
- Tap interaction on UI
- Backend logs completion timestamp
- Weekly summary aggregates this data (SQL group by)

---

### 🧱 React Components & Routes

| Component           | Path        | Description                     |
|--------------------|-------------|---------------------------------|
| DashboardPage       | `/`         | Daily view, drag & drop UI      |
| AddItemPage         | `/add`      | Form for adding task/habit      |
| WeekViewPage        | `/week`     | Weekly calendar & progress      |
| SettingsPage        | `/settings` | Notifications, sync prefs       |
| LoginPage           | `/login`    | Auth                            |

Reusable Components:
- TaskCard
- HabitTrackerBar
- DayTimeline
- AIRecommendationsBox

---

### 🌐 Backend Express Routes & Controllers

| Route               | Controller             | Description                           |
|---------------------|------------------------|---------------------------------------|
| POST /auth/login     | authController.login   | User login                            |
| GET /tasks           | taskController.list    | Get all tasks for the day             |
| POST /tasks          | taskController.add     | Add new task/habit                    |
| PUT /tasks/:id       | taskController.update  | Edit task/habit                       |
| POST /complete/:id   | taskController.complete| Mark complete                         |
| GET /week-summary    | summaryController.get  | Weekly view and stats                 |
| POST /ai/recommend   | aiController.suggest   | Call AI for daily improvements        |

---

### 🔌 Frontend ↔ Backend Integration

- Axios-based API service (`/services/api.ts`)
- JWT-based auth token in headers
- Use `react-query` or `swr` for caching
- Drag & drop sync via PATCH
- AI suggestions polled or pushed post-session

---

### 🗃 SQL vs. NoSQL Recommendation

| Data Type              | Store in         | Reason                          |
|------------------------|------------------|---------------------------------|
| User Profiles          | SQL              | Structured, relational          |
| Tasks & Habits         | SQL              | Strong schema, time-based       |
| AI Suggestions         | NoSQL (Mongo)    | Unstructured, growing entries   |
| Analytics              | SQL              | Efficient reporting              |

---

## 📋 Part 2: Developer Task List with AI Prompts

| Task Name                 | Description                                              | Priority | Notes                                   | AI Prompt |
|--------------------------|----------------------------------------------------------|----------|-----------------------------------------|-----------|
| Setup Project            | Initialize monorepo or separate frontend/backend         | High     | Use Vite + Express starter              | Create a full-stack Vite + Express starter with separate folders and shared linting setup. |
| Auth System              | Implement JWT login + secure routes                      | High     | Login page + middleware                 | Implement user login and JWT-based route protection in an Express + React setup. |
| Design Dashboard Page    | UI for daily view with drag & drop tasks                 | High     | Use react-beautiful-dnd or dnd-kit      | Build a drag & drop timeline component using react-beautiful-dnd for a daily task planner. |
| Create Task Model (SQL)  | SQL schema + endpoints for task CRUD                     | High     | Include title, type, startTime, repeat  | Write a PostgreSQL model and Express controller for a recurring task planner with REST API. |
| Add Habit Tracker UI     | Tap-to-complete with visual feedback                     | High     | Positive design                         | Build a React component that lets the user tap to complete a daily habit with confetti animation. |
| AI Suggestion Endpoint   | Backend API to call OpenAI with task history             | Medium   | OpenAI API + rate limits                | Create an Express route that takes user task history and sends a prompt to OpenAI for lifestyle suggestions. |
| Calendar Sync Integration| OAuth2 + Google Calendar API                             | Medium   | Token storage, refresh                  | Integrate Google Calendar with a Node.js backend using OAuth2 and list free time slots. |
| Weekly Summary Logic     | Aggregate completion data by category                    | Medium   | SQL aggregation                         | Write an SQL query that summarizes weekly task/habit completion rates per user by category. |
| Notification Scheduler   | Time-based reminders using node-cron or 3rd-party        | Low      | Optional in MVP                         | Add smart reminders to an Express app using node-cron that only notify users if they're falling behind. |
| AI Tone Generator        | Generate personalized supportive messages                | Low      | Encouraging tone                        | Generate supportive daily motivational messages using OpenAI with this context: health and productivity. |