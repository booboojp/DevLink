console.clear();
const express = require('express');
const passport = require('passport');
const cookieSession = require('cookie-session')
const bodyParser = require('body-parser');;
// const SQLiteStore = require('connect-sqlite3')(session);
// const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();




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
    return done(null, profile);
  }
));


const app = express();
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views')); 






app.use(cookieSession({
    name: 'github-auth-session',
    keys: ['key1', 'key2']
  }))
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(bodyParser.urlencoded({ extended: true }));




app.get('/', (req, res) => res.render('index'));
app.get('/auth/error', (req, res) => res.render('githubLoginError'));
app.get('/auth/github',passport.authenticate('github',{ scope: [ 'user:email' ] }));
app.get('/auth/github/callback', 
    passport.authenticate('github', { failureRedirect: '/auth/error' }), 
    function(req, res) {
        res.redirect('/');
    }
);


const PORT = 3000;
app.listen(PORT, () => {
    console.log('Process is running.');
});

