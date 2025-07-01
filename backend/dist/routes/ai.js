"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRoutes = void 0;
const express_1 = __importDefault(require("express"));
const supabase_client_1 = require("../supabase-client");
const auth_1 = require("../middleware/auth");
const aiService_1 = require("../services/aiService");
const router = express_1.default.Router();
exports.aiRoutes = router;
router.get('/recommendations', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { weekStart, weekEnd } = req.query;
    try {
        const tasks = await supabase_client_1.db.getWeeklyTasks(userId);
        const recommendations = aiService_1.AIService.generateRecommendations(tasks.map((task) => ({
            category: task.category,
            completed: task.completed,
            type: task.type,
            created_at: task.created_at || new Date().toISOString()
        })));
        res.json(recommendations);
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
router.get('/tips', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const stats = await supabase_client_1.db.getMonthlyCategoryStats(userId);
        const tips = aiService_1.AIService.generatePersonalizedTips(stats);
        res.json(tips);
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
router.get('/motivation', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const progress = await supabase_client_1.db.getTodayProgress(userId);
        const recommendations = aiService_1.AIService.generateRecommendations(progress.map((task) => ({
            category: task.category || 'general',
            completed: task.completed,
            type: task.type || 'task',
            created_at: task.created_at || new Date().toISOString()
        })));
        const motivation = recommendations.find((rec) => rec.type === 'encouragement' || rec.type === 'suggestion') || recommendations[0];
        res.json(motivation);
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
router.get('/tasks', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const tasks = await supabase_client_1.db.getTasksByUserId(userId);
        res.json(tasks);
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
router.post('/openai-recommendations', auth_1.authenticateToken, async (req, res) => {
    const { taskHistory, apiKey } = req.body;
    if (!apiKey) {
        return res.status(400).json({ error: 'OpenAI API key required' });
    }
    try {
        const recommendations = aiService_1.AIService.generateRecommendations(taskHistory).map(rec => ({
            ...rec,
            message: `[AI Enhanced] ${rec.message}`,
            source: 'openai'
        }));
        res.json(recommendations);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to get OpenAI recommendations' });
    }
});
router.post('/query-tasks', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { question } = req.body;
    try {
        const tasks = await supabase_client_1.db.getTasksByUserId(userId);
        let answer = '';
        if (process.env.OPENAI_API_KEY) {
            try {
                const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-3.5-turbo',
                        messages: [
                            { role: 'system', content: 'You are a productivity assistant. Answer questions about the user\'s tasks based on the provided data.' },
                            { role: 'user', content: `Tasks: ${JSON.stringify(tasks)}\nQuestion: ${question}` }
                        ],
                        temperature: 0.5,
                        max_tokens: 500
                    })
                });
                const data = await openaiRes.json();
                answer = data.choices?.[0]?.message?.content?.trim() || 'No answer generated.';
            }
            catch (e) {
                answer = 'AI service unavailable.';
            }
        }
        else {
            answer = `You asked: "${question}". You have ${tasks.length} tasks. (AI answer would go here.)`;
        }
        res.json({ answer });
    }
    catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});
