const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');


// Import models
const User = require('./models/User');
const Message = require('./models/Message');

// Import utilities
const chatUtils = require('./utils/chatUtils');

const PORT = 3000;
const MONGO_URI = 'mongodb://localhost:27017/realtime_chat';
const app = express();
const wsInstance = expressWs(app);

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Session configuration using MongoDB
app.use(session({
    secret: 'chat-app-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true in production with HTTPS
}));

// Authentication middleware
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/login');
};

// Admin middleware
const isAdmin = (req, res, next) => {
    if (req.session && req.session.role === 'admin') {
        return next();
    }
    res.status(403).render('error', { message: 'Access denied. Admin privileges required.' });
};

// Track connected clients
let connectedClients = [];

// Broadcast to all connected clients
function broadcastMessage(message) {
    const messageStr = JSON.stringify(message);
    connectedClients.forEach(client => {
        if (client.socket.readyState === 1) { // Check if the connection is open
            client.socket.send(messageStr);
        }
    });
}

// WebSocket endpoint
app.ws('/ws', async (socket, request) => {
    if (!request.session.userId || !request.session.username) {
        socket.close();
        return;
    }

    const username = request.session.username;
    
    // Handle new connection
    chatUtils.onNewClientConnected(socket, username, connectedClients, broadcastMessage);
    
    socket.on('message', async (rawMessage) => {
        try {
            const parsedMessage = JSON.parse(rawMessage);
            
            if (parsedMessage.type === 'chatMessage') {
                await chatUtils.onNewMessage(
                    parsedMessage.message,
                    username,
                    request.session.userId,
                    broadcastMessage
                );
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    socket.on('close', () => {
        chatUtils.onClientDisconnected(username, connectedClients, broadcastMessage);
    });
});

// Routes

// Home page route
app.get('/', async (req, res) => {
    if (req.session.userId) {
        return res.redirect('/dashboard');
    }
    
    try {
        // Get count of online users for display
        const onlineUserCount = connectedClients.length;
        res.render('index/unauthenticated', { onlineUserCount });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
});

// Login routes
app.get('/login', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.render('login', { error: req.query.error });
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.render('login', { error: 'Username and password are required' });
        }
        
        // Find user by username
        const user = await User.findOne({ username });
        
        if (!user) {
            return res.render('login', { error: 'Invalid username or password' });
        }
        
        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.render('login', { error: 'Invalid username or password' });
        }
        
        // Set session data
        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.role = user.role;
        
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', { error: 'An error occurred during login' });
    }
});

// Signup routes
app.get('/signup', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.render('signup', { error: req.query.error });
});

app.post('/signup', async (req, res) => {
    try {
        const { username, password, confirmPassword } = req.body;
        
        if (!username || !password) {
            return res.render('signup', { error: 'All fields are required' });
        }
        
        if (password !== confirmPassword) {
            return res.render('signup', { error: 'Passwords do not match' });
        }
        
        // Check if username already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.render('signup', { error: 'Username already exists' });
        }
        
        // Create new user
        const newUser = new User({
            username,
            password,
            role: 'user', // Default role
            joinDate: new Date()
        });
        
        await newUser.save();
        
        res.redirect('/login?success=Account created successfully');
    } catch (error) {
        console.error('Signup error:', error);
        res.render('signup', { error: 'An error occurred during signup' });
    }
});

// Dashboard route
app.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        // Get recent messages
        const recentMessages = await chatUtils.getRecentMessages(50);
        
        // Get current user
        const user = await User.findById(req.session.userId);
        
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }
        
        res.render('index/authenticated', {
            username: user.username,
            messages: recentMessages,
            userId: user._id,
            role: user.role
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
});

// Profile routes
app.get('/profile', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }
        
        res.render('profile/userProfile', {
            user,
            isSelf: true
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
});

app.get('/profile/:username', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        
        if (!user) {
            return res.status(404).render('error', { message: 'User not found' });
        }
        
        const isSelf = user._id.toString() === req.session.userId.toString();
        
        res.render('profile/userProfile', {
            user,
            isSelf
        });
    } catch (error) {
        console.error('User profile error:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
});

// Admin dashboard
app.get('/admin', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const users = await User.find().sort({ username: 1 });
        
        res.render('admin/dashboard', {
            users,
            currentUserId: req.session.userId
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
});

// Remove/ban user (admin only)
app.post('/admin/removeUser/:userId', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Don't allow removing yourself
        if (userId === req.session.userId.toString()) {
            return res.status(400).json({ error: 'You cannot remove yourself' });
        }
        
        await User.findByIdAndDelete(userId);
        
        res.redirect('/admin');
    } catch (error) {
        console.error('Remove user error:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
});

// Logout route
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).render('error', { message: 'Logout failed' });
        }
        res.redirect('/');
    });
});

// Connect to MongoDB and start server
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        
        // Create admin user if it doesn't exist
        return User.findOne({ role: 'admin' }).then(adminUser => {
            if (!adminUser) {
                console.log('Creating default admin user');
                const defaultAdmin = new User({
                    username: 'admin',
                    password: 'admin123', // This will be hashed by the pre-save hook
                    role: 'admin',
                    joinDate: new Date()
                });
                return defaultAdmin.save();
            }
        });
    })
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
    });