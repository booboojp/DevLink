const isLoggedIntoGitHub = (req, res, next) => {
    if (req.user) {
        next();
    } else {
        res.status(401).send('You must be logged into GitHub to access this page');
    }
}
m