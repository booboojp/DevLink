const isLoggedIntoGitHub = (req, res, next) => {
    if (req.user) {
        next();
    } else {
        res.redirect('/');
    }
}
const checkAuthStatus = (req, res, next) => {
    if (req.user) {
        console.log('User is logged in.');
        res.redirect('/dashboard');
    } else {
        console.log('User is not logged in.');
        next();
    }
}

module.exports = { isLoggedIntoGitHub, checkAuthStatus };