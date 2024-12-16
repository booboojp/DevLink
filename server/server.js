/**
 * Schrödinger's cat, you don't know if my code works unless you run it or not. 
 * With that logic, I can say that my code works if I never run it!
 */
console.clear();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const bodyParser = require('body-parser');;
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const SQLiteStore = require('connect-sqlite3')(session);
require('dotenv').config();
const app = express();

const http = require('http').Server(app); 
const io = require('socket.io')(http);

const { isLoggedIntoGitHub, checkAuthStatus } = require('../Middleware/authentication');
const GitHubStrategy = require('passport-github2').Strategy;
const db = new sqlite3.Database(path.join(__dirname, 'data/users.db'), (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
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
            )`, (err) => {
                if (err) {
                    console.error('Error creating users table:', err.message);
                }
            });
        });
    }
});

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
        ], (err) => {
            if (err) {
                console.error('Error inserting user into database:', err.message);
                return done(err);
            }
            return done(null, profile);
        });
    });
  }
));
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



app.use(express.static(path.join(__dirname, '../public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views')); 

app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: './server'
    }),
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json());
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
    const location = `${state.trim()}, ${city.trim()}`;

    db.get(`SELECT id FROM users WHERE github_id = ?`, [githubId], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!row) return res.status(404).json({ error: 'User not found' });

        const userId = row.id;
        const sql = `
            INSERT INTO personal_info (
                user_id, age, gender, likes, skills, location, looking_for
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                age = excluded.age,
                gender = excluded.gender,
                likes = excluded.likes,
                skills = excluded.skills,
                location = excluded.location,
                looking_for = excluded.looking_for
        `;

        db.run(sql, [userId, age, gender, likes, skills, location, looking_for], (err) => {
            if (err) return res.status(500).json({ error: 'Error updating profile' });
            console.log('Profile updated successfully:', { userId, age, gender, likes, skills, location, looking_for });
            res.json({ message: 'Profile updated successfully' });
        });
    });
});
app.get('/profile', isLoggedIntoGitHub, (req, res) => {
    const githubId = req.user.id;

    db.get(`
        SELECT users.*, personal_info.*
        FROM users
        LEFT JOIN personal_info ON users.id = personal_info.user_id
        WHERE users.github_id = ?
    `, [githubId], (err, row) => {
        if (err) {
            return res.status(500).send("Database error.");
        }
        if (!row) {
            return res.status(404).send("User not found.");
        }
        
        const userData = {
            username: row.username,
            avatar_url: row.avatar_url,
            bio: row.bio,
            _json: {
                avatar_url: row.avatar_url
            }
        };
        
        const personalInfo = {
            age: row.age,
            gender: row.gender,
            likes: row.likes,
            skills: row.skills,
            location: row.location,
            looking_for: row.looking_for
        };
        console.log('Personal info:', personalInfo);
        console.log('User data:', userData);
        
        res.render('profile', { user: userData, personalInfo });
    });
});
app.get('/api/search', isLoggedIntoGitHub, (req, res) => {
    const { state, city, age, gender, likes, skills, looking_for } = req.query;
    
    let query = `
        SELECT users.*, personal_info.*
        FROM users
        JOIN personal_info ON users.id = personal_info.user_id
        WHERE 1=1
    `;
    const params = [];

    if (state) {
        query += ` AND LOWER(personal_info.location) LIKE LOWER(?)`;
        params.push(`${state.trim()},%`);
    }
    if (city) {
        query += ` AND LOWER(personal_info.location) LIKE LOWER(?)`;
        params.push(`%, ${city.trim()}`);
    }
    if (age) {
        query += ` AND personal_info.age = ?`;
        params.push(parseInt(age));
    }
    if (gender) {
        query += ` AND LOWER(personal_info.gender) = LOWER(?)`;
        params.push(gender.trim());
    }
    if (likes) {
        query += ` AND LOWER(personal_info.likes) LIKE LOWER(?)`;
        params.push(`%${likes.trim()}%`);
    }
    if (skills) {
        query += ` AND LOWER(personal_info.skills) LIKE LOWER(?)`;
        params.push(`%${skills.trim()}%`);
    }
    if (looking_for) {
        query += ` AND LOWER(personal_info.looking_for) = LOWER(?)`;
        params.push(looking_for.trim());
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Search error:', err);
            return res.status(500).json({ users: [] });
        }
        const users = rows.map(row => ({
            id: row.id,
            github_id: row.github_id,
            username: row.username,
            location: row.location,
            looking_for: row.looking_for,
            likes: row.likes,
            skills: row.skills,
            age: row.age,
            gender: row.gender,
            avatar_url: row.avatar_url
        }));
        res.json({ users });
    });
});


app.get('/home', (req, res) => {
    res.render('home', { user: req.user });
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
app.get('/chat/:githubId', isLoggedIntoGitHub, (req, res) => {
    const otherUserGithubId = req.params.githubId;
    const currentUserGithubId = req.user.id;

    db.get(`SELECT * FROM users WHERE github_id = ?`, [otherUserGithubId], (err, otherUser) => {
        if (err) {
            return res.status(500).send("Database error.");
        }
        if (!otherUser) {
            return res.status(404).send("User not found.");
        }

        res.render('chat', { user: req.user, otherUser });
    });
});

io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('joinRoom', ({ roomId }) => {
        socket.join(roomId);

        const getMessages = `
            SELECT cm.*, u.username, u.profile_url, u.avatar_url
            FROM chat_messages cm
            LEFT JOIN users u ON cm.sender_id = u.github_id
            WHERE cm.room_id = ?
            ORDER BY cm.timestamp ASC
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
            db.get(`SELECT username, profile_url, avatar_url FROM users WHERE github_id = ?`, [senderId], (err, user) => {
                if (err || !user) {
                    console.error('Error fetching user info:', err);
                    return;
                }
                io.to(roomId).emit('chatMessage', {
                    id: this.lastID,
                    roomId,
                    senderId,
                    username: user.username,
                    profile_url: user.profile_url,
                    avatar_url: user.avatar_url,
                    message,
                    timestamp: new Date()
                });
            });
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

app.get('/api/profile-data', isLoggedIntoGitHub, (req, res) => {
    const githubId = req.user.id;
    
    db.get(
        `SELECT personal_info.* 
         FROM personal_info 
         JOIN users ON users.id = personal_info.user_id 
         WHERE users.github_id = ?`,
        [githubId],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(row || {});
        }
    );
});
app.get('/search', isLoggedIntoGitHub, (req, res) => {
    res.render('search', { user: req.user });
});
app.get('/profile/:githubId', isLoggedIntoGitHub, (req, res) => {
    const githubId = req.params.githubId;

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
            const userData = {
                username: userRow.username,
                avatar_url: userRow.avatar_url,
                bio: userRow.bio,
                _json: {
                    avatar_url: userRow.avatar_url
                }
            };
            res.render('profile', { user: userData, personalInfo: infoRow || {} });
        });
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
 
