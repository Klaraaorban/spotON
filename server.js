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
    res.sendFile(__dirname + '/public/dashboard.html'); 
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


// API Route for fetching tracks
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


//get top artists
app.get('/api/artists', async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    
    let access_token = req.user.accessToken;
    let refresh_token = req.user.refreshToken;
    
    try {
        const response = await axios.get('https://api.spotify.com/v1/me/top/artists?limit=10', {
            headers: {
                Authorization: `Bearer ${req.user.accessToken}`
            },
        });

        if (response.status === 401) {
            accessToken = await refreshAccessToken(refreshToken);

            const retryResponse = await axios.get('https://api.spotify.com/v1/me/top/artists?limit=10', {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                },
            });

            const artists = retryResponse.data.items.map((artist) => ({
                name: artist.name,
                genre: artist.genres.join(', ')
            }));
            return res.json(artists);
        }
        
        const artists = response.data.items.map((artist) => ({
            name: artist.name,
            genre: artist.genres.join(', ')
        }));
        res.json(artists);
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching artists");
    }
});
// API Route for feetching currently playing track
app.get('/api/now-playing', async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    let access_token = req.user.accessToken;
    let refresh_token = req.user.refreshToken;

    try {
        const response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: {
                Authorization: `Bearer ${access_token}`,
            },
        });

        if (response.status === 204 || !response.data) {
            return res.json({ is_playing: false, item: null });
        }

        return res.json(response.data);

    } catch (error) {
        if (error.response && error.response.status === 401) {
            try {
                access_token = await refreshAccessToken(refresh_token);

                const retryResponse = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
                    headers: {
                        Authorization: `Bearer ${access_token}`,
                    },
                });

                if (retryResponse.status === 204 || !retryResponse.data) {
                    return res.json({ is_playing: false, item: null });
                }

                return res.json(retryResponse.data);

            } catch (refreshError) {
                return res.status(500).json({ error: 'Unable to refresh access token or fetch playback' });
            }
        }

        return res.status(500).json({ error: 'Failed to fetch now playing' });
    }
});

// get top tracks for a time
// Get long-term top tracks
app.get('/api/top-tracks', async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    let accessToken = req.user.accessToken;
    let refreshToken = req.user.refreshToken;

    const fetchTopTracks = async (token) => {
        return axios.get('https://api.spotify.com/v1/me/top/tracks', {
            headers: { Authorization: `Bearer ${token}` },
            params: {
                time_range: 'long_term', // 🔥 This fetches ALL-TIME top tracks
                limit: 10
            }
        });
    };

    try {
        let response = await fetchTopTracks(accessToken);

        // Token expired or invalid
        if (response.status === 401) {
            accessToken = await refreshAccessToken(refreshToken);
            response = await fetchTopTracks(accessToken);
        }

        const tracks = response.data.items.map((track) => ({
            name: track.name,
            artist: track.artists.map((a) => a.name).join(', ')
        }));

        res.json(tracks);
    } catch (error) {
        console.error(error.response?.data || error);
        res.status(500).send('Error fetching top tracks');
    }
});

// API Route for fetching related artists
app.get('/api/related-artists', async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { name } = req.query;
    const accessToken = req.user.accessToken;

    try {
        // Step 1: Search for the artist to get ID
        const searchRes = await axios.get('https://api.spotify.com/v1/search', {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { q: name, type: 'artist', limit: 1 }
        });

        const artist = searchRes.data.artists.items[0];
        if (!artist) return res.status(404).json({ message: 'Artist not found' });

        // Step 2: Get related artists
        const relatedRes = await axios.get(`https://api.spotify.com/v1/artists/${artist.id}/related-artists`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const related = relatedRes.data.artists.map(a => ({
            id: a.id,
            name: a.name,
            popularity: a.popularity,
            genres: a.genres,
            image: a.images[0]?.url
        }));

        res.json({ root: artist.name, related });
    } catch (err) {
        console.error(err);
        res.status(500).send('Failed to fetch related artists');
    }
});


// Root Route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// export for Vercel serverless function environment
module.exports = (req, res) => {
    app(req, res); 
};

