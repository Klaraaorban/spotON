import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
let client;
let clientPromise;

if (!global._mongoClientPromise) {
  client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

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
      sharedAt: new Date(),
    });

    res.status(200).json({ message: 'Track shared!' });
  } catch (err) {
    console.error('MongoDB insert error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}
