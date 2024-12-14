console.clear();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const bodyParser = require('body-parser');;
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const SQLiteStore = require('connect-sqlite3')(session);
require('dotenv').config();
const app = express();

const http = require('http').Server(app);
const io = require('socket.io')(http);



// OTHER FILE IMPORTS AND SHIT
const { isLoggedIntoGitHub, checkAuthStatus } = require('../Middleware/authentication');
const GitHubStrategy = require('passport-github2').Strategy;

passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(user, done) {
    done(null, user);
});

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
  },
  function(accessToken, refreshToken, profile, done) {
    db.serialize(() => {
        db.run(`INSERT OR IGNORE INTO users (
            github_id, username, profile_url, avatar_url, bio, followers, following, public_repos, public_gists, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            profile.id,
            profile.username,
            profile.profileUrl,
            profile._json.avatar_url,
            profile._json.bio,
            profile._json.followers,
            profile._json.following,
            profile._json.public_repos,
            profile._json.public_gists,
            profile._json.created_at,
            profile._json.updated_at
        ]);
    });
    return done(null, profile);
  }
));



const db = new sqlite3.Database('./project/server/users.db');
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        github_id TEXT UNIQUE,
        username TEXT,
        profile_url TEXT,
        avatar_url TEXT,
        bio TEXT,
        followers INTEGER,
        following INTEGER,
        public_repos INTEGER,
        public_gists INTEGER,
        created_at TEXT,
        updated_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS personal_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        age INTEGER,
        gender TEXT,
        likes TEXT,
        skills TEXT,
        location TEXT,
        looking_for TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS chat_rooms (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT,
        sender_id TEXT,
        message TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS user_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user1_id TEXT,
        user2_id TEXT,
        room_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id)
    )`);
});



app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views')); 

app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: './project/server'
    }),
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.urlencoded({ extended: true }));






;
  




app.get('/', checkAuthStatus, (req, res) => {
    res.render('index');
});

app.get('/dashboard', isLoggedIntoGitHub, (req, res) => {
    res.render('dashboard', { user: req.user });
});


app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

app.get('/auth/github/callback', 
    passport.authenticate('github', { failureRedirect: '/auth/error' }), 
    function(req, res) {
        res.redirect('/dashboard');
    }
);
app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) { return next(err); }
        req.session.destroy((err) => {
            if (err) { return next(err); }
            res.redirect('/dashboard');
        });
    });
});

app.get('/auth/error', (req, res) => res.render('githubLoginError'));

app.post('/update-personal-info', isLoggedIntoGitHub, (req, res) => {
    const { age, gender, likes, skills, state, city, looking_for } = req.body;
    const githubId = req.user.id;
    const location = state && city ? `${state}, ${city}` : null;

    db.get(`SELECT id FROM users WHERE github_id = ?`, [githubId], (err, row) => {
        if (err) {
            return res.status(500).send("Database error.");
        }
        if (row) {
            const userId = row.id;
            db.run(`INSERT INTO personal_info (user_id, age, gender, likes, skills, location, looking_for) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                        age=COALESCE(excluded.age, personal_info.age),
                        gender=COALESCE(excluded.gender, personal_info.gender),
                        likes=COALESCE(excluded.likes, personal_info.likes),
                        skills=COALESCE(excluded.skills, personal_info.skills),
                        location=COALESCE(excluded.location, personal_info.location),
                        looking_for=COALESCE(excluded.looking_for, personal_info.looking_for)`,
                [userId, age, gender, likes, skills, location, looking_for], (err) => {
                    if (err) {
                        return res.status(500).send("Database error.");
                    }
                    res.redirect('/dashboard');
                });
        } else {
            res.status(404).send("User not found.");
        }
    });
});
app.get('/profile', isLoggedIntoGitHub, (req, res) => {
    const githubId = req.user.id;

    db.get(`SELECT * FROM users WHERE github_id = ?`, [githubId], (err, userRow) => {
        if (err) {
            return res.status(500).send("Database error.");
        }
        if (!userRow) {
            return res.status(404).send("User not found.");
        }
        db.get(`SELECT * FROM personal_info WHERE user_id = ?`, [userRow.id], (err, infoRow) => {
            if (err) {
                return res.status(500).send("Database error.");
            }
            res.render('profile', { user: userRow, personalInfo: infoRow || {} });
        });
    });
});
app.get('/search', isLoggedIntoGitHub, (req, res) => {
    res.render('search');
});
app.post('/search', isLoggedIntoGitHub, (req, res) => {
    const { location, looking_for } = req.body;

    const query = `
        SELECT users.*, personal_info.*
        FROM users
        JOIN personal_info ON users.id = personal_info.user_id
        WHERE personal_info.location = ? AND personal_info.looking_for = ?
    `;

    db.all(query, [location, looking_for], (err, rows) => {
        if (err) {
            return res.status(500).send("Database error.");
        }
        res.render('searchResults', { users: rows });
    });
});
app.get('/chat/:userId', isLoggedIntoGitHub, (req, res) => {
    const otherUserId = req.params.userId;
    const currentUserId = req.user.id;

    db.get(`SELECT * FROM users WHERE id = ?`, [otherUserId], (err, otherUser) => {
        if (err) {
            return res.status(500).send("Database error.");
        }
        res.render('chat', { user: req.user, otherUser });
    });
});
io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('joinRoom', ({ roomId }) => {
        socket.join(roomId);

        db.run(`INSERT OR IGNORE INTO chat_rooms (id) VALUES (?)`, [roomId]);
        const getMessages = `
            SELECT * FROM chat_messages
            WHERE room_id = ?
            ORDER BY timestamp ASC
        `;
        db.all(getMessages, [roomId], (err, messages) => {
            if (err) {
                console.error(err);
                return;
            }
            socket.emit('previousMessages', messages);
        });
    });

    socket.on('chatMessage', ({ roomId, message, senderId }) => {
        const insertMessage = `
            INSERT INTO chat_messages (room_id, sender_id, message)
            VALUES (?, ?, ?)
        `;
        db.run(insertMessage, [roomId, senderId, message], function(err) {
            if (err) {
                console.error('Error saving message:', err);
                return;
            }
            io.to(roomId).emit('chatMessage', {
                id: this.lastID,
                roomId,
                senderId,
                message,
                timestamp: new Date()
            });
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});




app.get('/api/chat-history/:roomId', isLoggedIntoGitHub, (req, res) => {
    const { roomId } = req.params;

    const query = `
        SELECT cm.*, u.username
        FROM chat_messages cm
        LEFT JOIN users u ON cm.sender_id = u.github_id
        WHERE room_id = ?
        ORDER BY timestamp ASC
    `;
    db.all(query, [roomId], (err, messages) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error fetching chat history' });
        }
        res.json(messages);
    });
});
const PORT = 3000;
http.listen(PORT, () => {
    console.log(`Process is running at port ${PORT}.`);
});

