const express = require('express');
const passport = require('passport');
const SpotifyStrategy = require('passport-spotify').Strategy;
const axios = require('axios');
const session = require('express-session');
require('dotenv').config();
// 
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
console.log('Mongo URI:', uri ? 'Loaded' : 'Missing');

let client;
let clientPromise;

if (!global._mongoClientPromise) {
  client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;
// 
const app = express();
app.use(express.json());

app.use(express.static('public')); // Serve static files from the "public" folder
app.use(session({ secret: "mysecret", resave: false, saveUninitialized: true, cookie: {maxAge: 300000}}));

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
        'playlist-modify-public', 'playlist-modify-private', 'user-read-recently-played'
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
app.get('/api/top-tracks', async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    let accessToken = req.user.accessToken;
    let refreshToken = req.user.refreshToken;

    try {
        const response = await axios.get('https://api.spotify.com/v1/me/top/tracks?limit=10', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (response.status === 401) {
            accessToken = await refreshAccessToken(refreshToken);

            // Retry the request with the new access token
            const retryResponse = await axios.get('https://api.spotify.com/v1/me/top/tracks?limit=50', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
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
        res.status(500).send('Error fetching top tracks');
    }
});

app.get('/api/recently-played', async (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

  const accessToken = req.user.accessToken;

  try {
    const response = await axios.get('https://api.spotify.com/v1/me/player/recently-played', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit: 25 }  
    });

    const tracks = response.data.items.map(item => {
      const track = item.track;
      return {
        name: track.name,
        artist: track.artists.map(a => a.name).join(', ')
      };
    });

    res.json(tracks);
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send('Failed to fetch recently played tracks');
  }
});
      // Fetch top tracks of all time
    app.get('/api/top-tracks', async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const accessToken = req.user.accessToken;
    const timeRange = 'long_term'; // Always long-term

    try {
        const response = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
                time_range: timeRange,
                limit: 10
            }
        });

        const tracks = response.data.items.map(track => ({
            name: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            album: track.album.name,
            image: track.album.images[0]?.url
        }));

        res.json(tracks);
    } catch (err) {
        console.error(err.response?.data || err);
        res.status(500).send('Failed to fetch top tracks');
    }
});


app.post('/api/share', async (req, res) => {
  const { track, artist, album, image_url } = req.body;

  if (!track || !artist) {
    return res.status(400).json({ error: 'Missing track or artist' });
  }

  try {
    const client = await clientPromise;
    const db = client.db('spotify');
    const collection = db.collection('shared_tracks');

    await collection.insertOne({
      track,
      artist,
      album,
      image_url,
    //   sharedAt: new Date(),
    });

    console.log('Insert successful:', track); // <---- Add this here

    res.status(200).json({ message: 'Track shared!' });
  } catch (err) {
    console.error('MongoDB insert error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// fetching the shared music to the dashboard
app.get('/api/shared-tracks', async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db('spotify');
    const collection = db.collection('shared_tracks');
    const tracks = await collection.find().sort({ sharedAt: -1 }).toArray(); // newest first
    res.json(tracks);
  } catch (err) {
    console.error('MongoDB fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch shared tracks' });
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

