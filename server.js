const express = require('express');
const passport = require('passport');
const SpotifyStrategy = require('passport-spotify').Strategy;
const axios = require('axios');
const session = require('express-session');
require('dotenv').config();

const app = express();

app.use(express.static('public')); // Serve static files from the "public" folder
app.use(session({ secret: "mysecret", resave: false, saveUninitialized: true, cookie: {maxAge: 30000}}));

app.use(passport.initialize());
app.use(passport.session());

// Serialization & Deserialization
passport.serializeUser((user, done) => { done(null, user); });
passport.deserializeUser((user, done) => { done(null, user); });

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
    res.redirect('/dashboard');
});

// Dashboard Route
app.get('/dashboard', (req, res) => {
    if (!req.user) return res.redirect('/');
    res.sendFile(__dirname + '/public/dashboard.html'); // Serve a dedicated dashboard file
});

async function refreshAccessToken(refreshToken) {
    const response = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.SPOTIFY_CLIENT_ID,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET,
    }));
    return response.data.access_token;
}


// API Route for Fetching Tracks
app.get('/api/tracks', async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    
    let access_token = req.user.accessToken;
    let refresh_token = req.user.refreshToken;
    
    try {
        const response = await axios.get('https://api.spotify.com/v1/me/top/tracks?limit=10', {
            headers: {
                Authorization: `Bearer ${req.user.accessToken}`
            },
        });

        if (response.status === 401) {
            accessToken = await refreshAccessToken(refreshToken);

            // Retry the request with the new access token
            const retryResponse = await axios.get('https://api.spotify.com/v1/me/top/tracks?limit=10', {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                },
            });

            const tracks = retryResponse.data.items.map((track) => ({
                name: track.name,
                artist: track.artists.map((a) => a.name).join(', ')
            }));
            return res.json(tracks);
        }
        
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

// Root Route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html'); // Serve the login page
});

// Adjusting Export for Vercel's serverless function environment
module.exports = (req, res) => {
    app(req, res); // Invoke the express app to handle requests in serverless context
};
