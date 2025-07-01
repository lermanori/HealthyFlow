"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const supabase_client_1 = require("../supabase-client");
const router = express_1.default.Router();
exports.authRoutes = router;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await supabase_client_1.db.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const isValidPassword = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            },
            token
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});
router.get('/verify', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const user = await supabase_client_1.db.getUserById(decoded.userId);
        if (!user) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        res.json(user);
    }
    catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
router.post('/register', async (req, res) => {
    const { email, password, name, adminToken } = req.body;
    if (adminToken !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        const existingUser = await supabase_client_1.db.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const user = await supabase_client_1.db.createUser({
            email,
            name,
            password_hash: passwordHash
        });
        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});
router.get('/users', async (req, res) => {
    const { adminToken } = req.query;
    if (adminToken !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        const users = await supabase_client_1.db.getAllUsers();
        res.json(users.map(user => ({
            id: user.id,
            email: user.email,
            name: user.name,
            created_at: user.created_at
        })));
    }
    catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});
router.post('/users/:userId/reset-password', async (req, res) => {
    const { adminToken, newPassword } = req.body;
    const { userId } = req.params;
    if (adminToken !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    if (!newPassword) {
        return res.status(400).json({ error: 'New password is required' });
    }
    try {
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
        await supabase_client_1.db.updateUserPassword(userId, passwordHash);
        res.json({ success: true, message: 'Password reset successfully' });
    }
    catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});
router.delete('/users/:userId', async (req, res) => {
    const { adminToken } = req.query;
    const { userId } = req.params;
    if (adminToken !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        await supabase_client_1.db.deleteUser(userId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});
