"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRoutes = void 0;
const express_1 = __importDefault(require("express"));
const supabase_client_1 = require("../supabase-client");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
exports.analyticsRoutes = router;
router.get('/productivity', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { days } = req.query;
    try {
        const analytics = await supabase_client_1.db.getProductivityAnalytics(userId, Number(days) || 7);
        res.json(analytics);
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
router.get('/streaks', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const habits = await supabase_client_1.db.getHabitStreaks(userId);
        const habitGroups = habits.reduce((acc, habit) => {
            const key = `${habit.title}-${habit.category}`;
            if (!acc[key]) {
                acc[key] = {
                    title: habit.title,
                    category: habit.category,
                    completed_days: 0,
                    total_days: 0,
                    last_completed: null
                };
            }
            acc[key].total_days += 1;
            if (habit.completed) {
                acc[key].completed_days += 1;
                if (!acc[key].last_completed || habit.completed_at > acc[key].last_completed) {
                    acc[key].last_completed = habit.completed_at;
                }
            }
            return acc;
        }, {});
        const streaks = Object.values(habitGroups).map((habit) => ({
            ...habit,
            streak: habit.completed_days,
            completion_rate: habit.total_days > 0 ? habit.completed_days / habit.total_days : 0
        }));
        res.json(streaks);
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
router.get('/time-distribution', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const distribution = await supabase_client_1.db.getTimeDistribution(userId);
        res.json(distribution);
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
