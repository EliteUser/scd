import express from 'express';
import cors from 'cors';

import { APP_PORT } from './constants.js';
import { getProcessedTrack } from './helpers.js';

const app = express();

app.use(express.static('public'));
app.use(express.json());
app.use(cors());

/* Route to handle track download requests */
app.post('/download', async (req, res) => {
  const { url, name, album, lyrics } = req.body;

  if (!url || !name) {
    return res.status(400).send('URL and name are required');
  }

  const options = {
    url: url.trim(),
    name: name.trim(),
    album: album?.trim(),
    lyrics: lyrics?.trim(),
  };

  try {
    const filePath = await getProcessedTrack(options);

    res.download(filePath, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).send('Error sending file');
      }
    });
  } catch (error) {
    console.error('Error downloading track:', error);
    res.status(500).send('Error downloading track');
  }
});

/* Start the server */
app.listen(APP_PORT, () => {
  console.info(`Server is running on http://localhost:${APP_PORT}`);
});

export default app;
