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



//get top genres
// app.get('/api/genres', async (req, res) => {
//     if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

//     let accessToken = req.user.accessToken;
//     let refreshToken = req.user.refreshToken;

//     try {
//         const response = await axios.get('https://api.spotify.com/v1/me/top/artists?limit=50', {
//             headers: {
//                 Authorization: `Bearer ${accessToken}`,
//             },
//         });

//         if (response.status === 401) {
//             accessToken = await refreshAccessToken(refreshToken);

//             // Retry the request with the new access token
//             const retryResponse = await axios.get('https://api.spotify.com/v1/me/top/artists?limit=50', {
//                 headers: {
//                     Authorization: `Bearer ${accessToken}`,
//                 },
//             });

//             // Flatten genres from the top artists
//             const genres = retryResponse.data.items
//                 .flatMap((artist) => artist.genres)
//                 .filter((genre, index, self) => genre && self.indexOf(genre) === index); // Remove duplicates
//             return res.json(genres);
//         }

//         // Flatten genres from the top artists
//         const genres = response.data.items
//             .flatMap((artist) => artist.genres)
//             .filter((genre, index, self) => genre && self.indexOf(genre) === index); // Remove duplicates
//         res.json(genres);
//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Error fetching genres');
//     }
// });

// Root Route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// export for Vercel serverless function environment
module.exports = (req, res) => {
    app(req, res); 
};

// small change