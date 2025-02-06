const express = require('express');
const passport = require('passport');
const SpotifyStrategy = require('passport-spotify').Strategy;
const axios = require('axios');
const session = require('express-session');
require('dotenv').config();

const app = express();

app.use(express.static('public')); // Serve static files from the "public" folder
app.use(session({
    secret: "mysecret",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 300000, secure: process.env.NODE_ENV === 'production' },
}));

app.use(passport.initialize());
app.use(passport.session());

// Serialization & Deserialization
passport.serializeUser((user, done) => {
    console.log('serialize user: ', user);
    done(null, user);
});
passport.deserializeUser((user, done) => {
    console.log('deserialize user: ', user);
    done(null, user);
});

// Spotify Strategy
passport.use(new SpotifyStrategy({
    clientID: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    callbackURL: 'https://www.spot-on-wrapped.me/callback',
}, (accessToken, refreshToken, expires_in, profile, done) => {
    profile.accessToken = accessToken;
    profile.refreshToken = refreshToken;
    return done(null, profile);
}));

// Spotify Authentication Route
app.get("/auth/spotify", passport.authenticate('spotify', {
    scope: [
        'user-read-email', 'user-read-private', 'user-read-playback-state',
        'user-modify-playback-state', 'user-read-currently-playing',
        'user-top-read', 'playlist-read-private', 'playlist-read-collaborative',
        'playlist-modify-public', 'playlist-modify-private'
    ]
}));

// Spotify Callback Route
app.get('/callback', passport.authenticate('spotify', { failureRedirect: '/' }), (req, res) => {
    req.session.accessToken = req.user.accessToken;
    req.session.refreshToken = req.user.refreshToken;

    console.log("Access token: ", req.session.accessToken);

    axios.get('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${req.session.accessToken}` }
    })
    .then(response => {
        req.session.profile = response.data; // Store profile in session
        res.redirect('/dashboard');  // Redirect to the dashboard after successful authentication
    })
    .catch(error => {
        console.error("Error fetching profile: ", error.response ? error.response.data : error.message);
        res.status(500).send('Error fetching profile');
    });
});

// Dashboard Route
app.get('/dashboard', (req, res) => {
    if (!req.session.profile) {
        return res.redirect('/'); // Redirect to login if no profile in session
    }
    res.sendFile(__dirname + '/public/dashboard.html'); // Serve the dashboard file
});

// API Route for Fetching Tracks
app.get('/api/tracks', async (req, res) => {
    if (!req.session.accessToken) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const response = await axios.get('https://api.spotify.com/v1/me/top/tracks?limit=10', {
            headers: {
                Authorization: `Bearer ${req.session.accessToken}`
            },
        });

        const tracks = response.data.items.map((track) => ({
            name: track.name,
            artist: track.artists.map((a) => a.name).join(', ')
        }));

        res.json(tracks);
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching tracks");
    }
});

// Logout Route
app.get('/logout', (req, res) => {
    req.logout(() => {
        req.session.destroy(() => {
            res.redirect('/');
        });
    });
});

// Root Route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html'); // Serve the login page
});

module.exports = (req, res) => {
    app(req, res); // Invoke the express app to handle requests
};
