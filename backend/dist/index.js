"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const auth_1 = require("./routes/auth");
const tasks_1 = require("./routes/tasks");
const summary_1 = require("./routes/summary");
const ai_1 = require("./routes/ai");
const analytics_1 = require("./routes/analytics");
const admin_1 = require("./routes/admin");
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/api/auth', auth_1.authRoutes);
app.use('/api/tasks', tasks_1.taskRoutes);
app.use('/api', summary_1.summaryRoutes);
app.use('/api/ai', ai_1.aiRoutes);
app.use('/api/analytics', analytics_1.analyticsRoutes);
app.use('/api/admin', admin_1.adminRoutes);
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        features: [
            'Task Management',
            'Habit Tracking',
            'AI Recommendations',
            'Smart Reminders',
            'Weekly Analytics',
            'Drag & Drop Timeline'
        ]
    });
});
app.listen(PORT, () => {
    console.log(`🚀 HealthyFlow Server running on port ${PORT}`);
    console.log(`📊 Features: Task Management, AI Recommendations, Smart Reminders`);
    console.log(`🔗 API Health: http://localhost:${PORT}/api/health`);
});
