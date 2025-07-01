"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../.env') });
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
exports.db = {
    async createUser(userData) {
        const { data, error } = await exports.supabase
            .from('users')
            .insert(userData)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    },
    async getUserByEmail(email) {
        const { data, error } = await exports.supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
        if (error)
            throw error;
        return data;
    },
    async getUserById(userId) {
        const { data, error } = await exports.supabase
            .from('users')
            .select('id, email, name')
            .eq('id', userId)
            .single();
        if (error)
            throw error;
        return data;
    },
    async getAllUsers() {
        const { data, error } = await exports.supabase
            .from('users')
            .select('id, email, name, created_at')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return data;
    },
    async deleteUser(userId) {
        const { error } = await exports.supabase
            .from('users')
            .delete()
            .eq('id', userId);
        if (error)
            throw error;
    },
    async updateUserPassword(userId, passwordHash) {
        const { error } = await exports.supabase
            .from('users')
            .update({ password_hash: passwordHash })
            .eq('id', userId);
        if (error)
            throw error;
    },
    async createTask(taskData) {
        const { data, error } = await exports.supabase
            .from('tasks')
            .insert(taskData)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    },
    async getTasksByUserId(userId, date) {
        let query = exports.supabase
            .from('tasks')
            .select('*')
            .eq('user_id', userId);
        if (date) {
            query = query.eq('scheduled_date', date);
        }
        const { data, error } = await query
            .order('start_time', { ascending: true })
            .order('created_at', { ascending: true });
        if (error)
            throw error;
        return data;
    },
    async getTaskById(taskId) {
        const { data, error } = await exports.supabase
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .single();
        if (error)
            throw error;
        return data;
    },
    async updateTask(taskId, updates) {
        const { data, error } = await exports.supabase
            .from('tasks')
            .update(updates)
            .eq('id', taskId)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    },
    async deleteTask(taskId) {
        const { error } = await exports.supabase
            .from('tasks')
            .delete()
            .eq('id', taskId);
        if (error)
            throw error;
    },
    async deleteTasksByUserId(userId, date) {
        let query = exports.supabase
            .from('tasks')
            .delete()
            .eq('user_id', userId);
        if (date) {
            query = query.eq('scheduled_date', date);
        }
        const { error } = await query;
        if (error)
            throw error;
    },
    async updateTasksOverdueNotified(userId, taskIds) {
        const { error } = await exports.supabase
            .from('tasks')
            .update({ overdue_notified: true })
            .eq('user_id', userId)
            .in('id', taskIds);
        if (error)
            throw error;
    },
    async getWeeklyTasks(userId) {
        const { data, error } = await exports.supabase
            .from('tasks')
            .select('category, completed, type')
            .eq('user_id', userId)
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
        if (error)
            throw error;
        return data;
    },
    async getMonthlyCategoryStats(userId) {
        const { data, error } = await exports.supabase
            .from('tasks')
            .select('category, completed')
            .eq('user_id', userId)
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
        if (error)
            throw error;
        return data;
    },
    async getTodayProgress(userId) {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await exports.supabase
            .from('tasks')
            .select('completed')
            .eq('user_id', userId)
            .gte('created_at', today);
        if (error)
            throw error;
        return data;
    },
    async getProductivityAnalytics(userId, days = 7) {
        const { data, error } = await exports.supabase
            .from('tasks')
            .select('created_at, category, type, completed')
            .eq('user_id', userId)
            .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
        if (error)
            throw error;
        return data;
    },
    async getHabitStreaks(userId) {
        const { data, error } = await exports.supabase
            .from('tasks')
            .select('title, category, completed, completed_at')
            .eq('user_id', userId)
            .eq('type', 'habit')
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
        if (error)
            throw error;
        return data;
    },
    async getTimeDistribution(userId) {
        const { data, error } = await exports.supabase
            .from('tasks')
            .select('category, duration')
            .eq('user_id', userId)
            .eq('completed', true)
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
        if (error)
            throw error;
        return data;
    },
    async createRecommendation(recommendationData) {
        const { data, error } = await exports.supabase
            .from('ai_recommendations')
            .insert(recommendationData)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    },
    async getRecommendationsByUserId(userId) {
        const { data, error } = await exports.supabase
            .from('ai_recommendations')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return data;
    },
    async createMultipleRecommendations(recommendations) {
        const { data, error } = await exports.supabase
            .from('ai_recommendations')
            .insert(recommendations)
            .select();
        if (error)
            throw error;
        return data;
    },
    async deleteRecommendationsByUserId(userId) {
        const { error } = await exports.supabase
            .from('ai_recommendations')
            .delete()
            .eq('user_id', userId);
        if (error)
            throw error;
    }
};
