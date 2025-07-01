"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryRoutes = void 0;
const express_1 = __importDefault(require("express"));
const supabase_client_1 = require("../supabase-client");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
exports.summaryRoutes = router;
router.get('/week-summary', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const tasks = await supabase_client_1.db.getWeeklyTasks(userId);
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(task => task.completed).length;
        const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
        const categories = {};
        tasks.forEach((task) => {
            if (!categories[task.category]) {
                categories[task.category] = { total: 0, completed: 0 };
            }
            categories[task.category].total++;
            if (task.completed) {
                categories[task.category].completed++;
            }
        });
        const streaks = {
            daily: Math.floor(Math.random() * 7) + 1,
            weekly: Math.floor(Math.random() * 4) + 1
        };
        res.json({
            totalTasks,
            completedTasks,
            completionRate,
            categories,
            streaks
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
