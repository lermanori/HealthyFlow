"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRoutes = void 0;
const express_1 = __importDefault(require("express"));
const supabase_client_1 = require("../supabase-client");
const router = express_1.default.Router();
exports.adminRoutes = router;
const requireAdmin = (req, res, next) => {
    const adminToken = req.headers['x-admin-token'] || req.query.adminToken;
    if (adminToken !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const users = await supabase_client_1.db.getAllUsers();
        const usersWithStats = await Promise.all(users.map(async (user) => {
            const tasks = await supabase_client_1.db.getTasksByUserId(user.id);
            const completedTasks = tasks.filter((task) => task.completed);
            return {
                ...user,
                totalTasks: tasks.length,
                completedTasks: completedTasks.length,
                completionRate: tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0
            };
        }));
        res.json(usersWithStats);
    }
    catch (error) {
        console.error('Get users with stats error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});
router.get('/users/:userId', requireAdmin, async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await supabase_client_1.db.getUserById(userId);
        const tasks = await supabase_client_1.db.getTasksByUserId(userId);
        const recommendations = await supabase_client_1.db.getRecommendationsByUserId(userId);
        res.json({
            user,
            tasks,
            recommendations,
            stats: {
                totalTasks: tasks.length,
                completedTasks: tasks.filter((task) => task.completed).length,
                totalRecommendations: recommendations.length
            }
        });
    }
    catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});
router.delete('/users/:userId', requireAdmin, async (req, res) => {
    const { userId } = req.params;
    try {
        await supabase_client_1.db.deleteTasksByUserId(userId);
        await supabase_client_1.db.deleteRecommendationsByUserId(userId);
        await supabase_client_1.db.deleteUser(userId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const users = await supabase_client_1.db.getAllUsers();
        const allTasks = await Promise.all(users.map(user => supabase_client_1.db.getTasksByUserId(user.id)));
        const totalUsers = users.length;
        const totalTasks = allTasks.flat().length;
        const completedTasks = allTasks.flat().filter((task) => task.completed).length;
        res.json({
            totalUsers,
            totalTasks,
            completedTasks,
            completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
            averageTasksPerUser: totalUsers > 0 ? totalTasks / totalUsers : 0
        });
    }
    catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});
