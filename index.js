import express from 'express';
import cors from 'cors';

import {APP_PORT, DEFAULT_ALBUM_NAME, DOWNLOADER_URL} from "./constants.js";
import {getProcessedTrack} from "./helpers.js";

const app = express();
const port = APP_PORT;

app.use(express.static('public'));
app.use(express.json());
app.use(cors());

/* Route to handle track download requests */
app.post('/download', async (req, res) => {
    const {url, name, album = DEFAULT_ALBUM_NAME} = req.body;

    if (!url || !name) {
        return res.status(400).send('URL and name are required');
    }

    const options = {
        url,
        name,
        album
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
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
