"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskRoutes = void 0;
const express_1 = __importDefault(require("express"));
const uuid_1 = require("uuid");
const supabase_client_1 = require("../supabase-client");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
exports.taskRoutes = router;
router.get('/', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { date } = req.query;
    console.log('Backend - Getting tasks for date:', date);
    console.log('Backend - User ID:', userId);
    try {
        const tasks = await supabase_client_1.db.getTasksByUserId(userId, date);
        console.log('Backend - Raw tasks from database:', tasks);
        console.log('Backend - Number of tasks found:', tasks.length);
        const formattedTasks = tasks.map((task) => ({
            id: task.id,
            title: task.title,
            type: task.type,
            category: task.category,
            startTime: task.start_time,
            duration: task.duration,
            repeat: task.repeat_type,
            completed: Boolean(task.completed),
            scheduledDate: task.scheduled_date,
            createdAt: task.created_at,
            overdueNotified: Boolean(task.overdue_notified)
        }));
        console.log('Backend - Formatted tasks being sent:', formattedTasks);
        res.json(formattedTasks);
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
router.post('/', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { title, type, category, startTime, duration, repeat, scheduledDate } = req.body;
    console.log('Backend - Adding task with scheduledDate:', scheduledDate);
    console.log('Backend - Task details:', { title, type, category, startTime, duration, repeat, scheduledDate });
    try {
        const taskData = {
            id: (0, uuid_1.v4)(),
            user_id: userId,
            title,
            type,
            category,
            start_time: startTime,
            duration,
            repeat_type: repeat,
            scheduled_date: scheduledDate
        };
        const task = await supabase_client_1.db.createTask(taskData);
        res.json({
            id: task.id,
            title: task.title,
            type: task.type,
            category: task.category,
            startTime: task.start_time,
            duration: task.duration,
            repeat: task.repeat_type,
            completed: false,
            scheduledDate: task.scheduled_date,
            createdAt: task.created_at
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
router.put('/:id', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const taskId = req.params.id;
    const updates = req.body;
    const updateData = {};
    if (updates.title !== undefined) {
        updateData.title = updates.title;
    }
    if (updates.startTime !== undefined) {
        updateData.start_time = updates.startTime;
    }
    if (updates.duration !== undefined) {
        updateData.duration = updates.duration;
    }
    if (updates.category !== undefined) {
        updateData.category = updates.category;
    }
    if (updates.scheduledDate !== undefined) {
        updateData.scheduled_date = updates.scheduledDate;
    }
    if (updates.completed !== undefined) {
        updateData.completed = updates.completed;
        if (updates.completed) {
            updateData.completed_at = new Date().toISOString();
        }
        else {
            updateData.completed_at = null;
        }
    }
    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
    }
    try {
        const task = await supabase_client_1.db.updateTask(taskId, updateData);
        res.json({
            id: task.id,
            title: task.title,
            type: task.type,
            category: task.category,
            startTime: task.start_time,
            duration: task.duration,
            repeat: task.repeat_type,
            completed: Boolean(task.completed),
            scheduledDate: task.scheduled_date,
            createdAt: task.created_at
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
router.post('/complete/:id', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const taskId = req.params.id;
    try {
        const task = await supabase_client_1.db.updateTask(taskId, {
            completed: true,
            completed_at: new Date().toISOString()
        });
        res.json({
            id: task.id,
            title: task.title,
            type: task.type,
            category: task.category,
            startTime: task.start_time,
            duration: task.duration,
            repeat: task.repeat_type,
            completed: Boolean(task.completed),
            scheduledDate: task.scheduled_date,
            createdAt: task.created_at
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
router.delete('/:id', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const taskId = req.params.id;
    try {
        await supabase_client_1.db.deleteTask(taskId);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
router.delete('/', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { date } = req.query;
    try {
        await supabase_client_1.db.deleteTasksByUserId(userId, date);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
router.patch('/overdue-notified', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { taskIds } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'taskIds must be a non-empty array' });
    }
    try {
        await supabase_client_1.db.updateTasksOverdueNotified(userId, taskIds);
        res.json({ success: true, updated: taskIds.length });
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
