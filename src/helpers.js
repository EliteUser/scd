import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import axios from "axios";
import puppeteer from "puppeteer";

import {
    DEFAULT_ALBUM_NAME,
    DEFAULT_TRACK_NAME,
    DOWNLOADER_DOWNLOAD_SELECTOR,
    DOWNLOADER_IMAGE_SELECTOR,
    DOWNLOADER_INPUT_SELECTOR,
    DOWNLOADER_SUBMIT_SELECTOR,
    DOWNLOADER_URL
} from "./constants.js";
import {processTrack} from "./music-processor.js";

export const getId = () => {
    return crypto.randomBytes(16).toString('hex').slice(0, 8);
}

const removeFolder = (folder) => {
    if (fs.existsSync(folder)) {
        fs.rmSync(folder, {recursive: true});
    }
}

const downloadFile = async (options) => {
    const {url, folder, name = DEFAULT_TRACK_NAME, type = 'mp3'} = options;

    const filePath = path.resolve('./', folder, `${name}.${type}`);
    const fileStream = fs.createWriteStream(filePath);

    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        response.data.pipe(fileStream);

        return new Promise((resolve, reject) => {
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
        });
    } catch (error) {
        console.error('Error downloading track:', error);
        throw error;
    }
};

export const downloadTrackAssets = async (url, name = DEFAULT_TRACK_NAME) => {
    const browser = await puppeteer.launch({headless: true});
    const page = await browser.newPage();

    const downloadFolder = `track_${getId()}`;

    console.info(`Starting download assets for track: ${name}`);

    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(DOWNLOADER_URL, {waitUntil: 'networkidle2'});

            /* Type the URL into the input field */
            await page.type(DOWNLOADER_INPUT_SELECTOR, url);

            /* Click the submit button */
            await page.click(DOWNLOADER_SUBMIT_SELECTOR);

            /* Wait for the download link to appear */
            await page.waitForSelector(DOWNLOADER_DOWNLOAD_SELECTOR, {timeout: 60000});

            const trackUrl = await page.$eval(DOWNLOADER_DOWNLOAD_SELECTOR, a => a.href);
            const imageUrl = await page.$eval(DOWNLOADER_IMAGE_SELECTOR, img => img.src);

            if (!trackUrl || !imageUrl) {
                reject(new Error('Failed to download track assets'));
            }

            /* Create folder for download */
            if (!fs.existsSync(downloadFolder)) {
                fs.mkdirSync(downloadFolder);
            }

            await Promise.all([
                downloadFile({url: trackUrl, folder: downloadFolder, name, type: 'mp3'}),
                downloadFile({url: imageUrl, folder: downloadFolder, name, type: 'jpg'})
            ]);

            console.info('Track assets downloaded successfully!');

            resolve(downloadFolder);
        } catch (err) {
            console.error('An error occurred:', err.message);
            reject(err);
        } finally {
            await browser.close();
        }
    });
};

export const getProcessedTrack = async (options) => {
    const {url, name = DEFAULT_TRACK_NAME, album = DEFAULT_ALBUM_NAME} = options;

    const folderPath = await downloadTrackAssets(url, name);

    setTimeout(() => {
        removeFolder(folderPath);
    }, 60000);

    return await processTrack({
        folderPath, name, album
    });
}