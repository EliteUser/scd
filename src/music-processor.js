import fs from 'node:fs';
import path from 'node:path';
import NodeID3 from 'node-id3';

import {DEFAULT_ALBUM_NAME, IMAGE_EXTENSIONS} from './constants.js';
import {getId} from './helpers.js';

const getFileTags = (options) => {
    const {fileName, fileAlbum, lyrics} = options;

    const [artist, title] = fileName.split(' - ');

    return {
        artist,
        performerInfo: getId(),
        title,
        album: fileAlbum ? fileAlbum : DEFAULT_ALBUM_NAME,
        unsynchronisedLyrics: {
            language: 'eng',
            text: lyrics
        }
    };
};

const getImageTags = (name) => {
    for (const ext of IMAGE_EXTENSIONS) {
        const imagePath = `${name.split('.')[0]}${ext}`;

        if (fs.existsSync(imagePath)) {
            const imageBuffer = fs.readFileSync(imagePath);

            return {
                image: {
                    mime: ext === '.png' ? 'image/png' : 'image/jpeg',
                    type: {
                        id: 0x03,
                        name: 'front cover'
                    },
                    imageBuffer
                }
            };
        }
    }

    return {};
}

export const processTrack = async (options) => {
    const {folderPath, name, album, lyrics} = options;

    const filePath = path.join('./', folderPath, `${name}.mp3`);

    const nameTags = getFileTags({fileName: name, fileAlbum: album, lyrics});
    const imageTags = getImageTags(filePath);

    const tags = {
        ...nameTags,
        ...imageTags
    };

    const trackTitle = `${tags.artist} - ${tags.title}`;

    return new Promise((resolve, reject) => {
        NodeID3.update(tags, filePath, (err) => {
            if (err) {
                console.log(`Error processing ${trackTitle}`);
                reject(err);
            } else {
                console.log(`Processed: ${trackTitle}`);
                resolve(filePath);
            }
        });
    })
};

