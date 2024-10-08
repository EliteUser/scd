import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import axios from 'axios';
import puppeteer from 'puppeteer-core';
import * as ChromeLauncher from 'chrome-launcher';

import {
  DEFAULT_ALBUM_NAME,
  DEFAULT_TRACK_NAME,
  DOWNLOADER_DOWNLOAD_SELECTOR,
  DOWNLOADER_IMAGE_SELECTOR,
  DOWNLOADER_INPUT_SELECTOR,
  DOWNLOADER_SUBMIT_SELECTOR,
  DOWNLOADER_URL,
} from './constants.js';
import { processTrack } from './music-processor.js';

export const getId = () => {
  return crypto.randomBytes(16).toString('hex').slice(0, 8);
};

const removeFolder = (folder) => {
  if (fs.existsSync(folder)) {
    fs.rmSync(folder, { recursive: true });
  }
};

const setupBrowser = async () => {
  const chromeExecutablePath = ChromeLauncher.Launcher.getInstallations()[0];

  const browser = await puppeteer.launch({
    executablePath: chromeExecutablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  return browser;
};

const downloadFile = async (options) => {
  const { url, folder, name = DEFAULT_TRACK_NAME, type = 'mp3' } = options;

  const filePath = path.resolve('./', folder, `${name}.${type}`);
  const fileStream = fs.createWriteStream(filePath);

  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
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
  const browser = await setupBrowser();

  const page = await browser.newPage();
  await page.setRequestInterception(true);

  page.on('request', (req) => {
    const resourceType = req.resourceType();

    if (['stylesheet', 'font'].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  const downloadFolder = `track_${getId()}`;

  console.info(`Starting download assets for track: ${name}`);

  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(DOWNLOADER_URL, { waitUntil: 'networkidle2' });

      /* Wait for the url input and submit button to appear */
      await Promise.all([
        page.waitForSelector(DOWNLOADER_INPUT_SELECTOR, {
          visible: true,
          timeout: 15000,
        }),
        page.waitForSelector(DOWNLOADER_SUBMIT_SELECTOR, {
          visible: true,
          timeout: 15000,
        }),
      ]);

      const urlInput = await page.$(DOWNLOADER_INPUT_SELECTOR);
      const button = await page.$(DOWNLOADER_SUBMIT_SELECTOR);

      if (!urlInput || !button) {
        reject(new Error('Failed to find input or button'));
      }

      /* Set the URL into the input field, because
       * agreement popup may break the interactions
       */
      await page.evaluate(
        (input, url, button) => {
          input.value = url;
          button.click();
        },
        urlInput,
        url,
        button
      );

      /* Wait for the download link and image to appear */
      await Promise.all([
        page.waitForSelector(DOWNLOADER_DOWNLOAD_SELECTOR, {
          visible: true,
          timeout: 60000,
        }),
        page.waitForSelector(DOWNLOADER_IMAGE_SELECTOR, {
          visible: true,
          timeout: 60000,
        }),
      ]);

      const trackUrl = await page.$eval(
        DOWNLOADER_DOWNLOAD_SELECTOR,
        (a) => a.href
      );
      const imageUrl = await page.$eval(
        DOWNLOADER_IMAGE_SELECTOR,
        (img) => img.src
      );

      if (!trackUrl || !imageUrl) {
        reject(new Error('Failed to download track assets'));
      }

      /* Create folder for download */
      if (!fs.existsSync(downloadFolder)) {
        fs.mkdirSync(downloadFolder);
      }

      await Promise.all([
        downloadFile({
          url: trackUrl,
          folder: downloadFolder,
          name,
          type: 'mp3',
        }),
        downloadFile({
          url: imageUrl,
          folder: downloadFolder,
          name,
          type: 'jpg',
        }),
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
  const {
    url,
    name = DEFAULT_TRACK_NAME,
    album = DEFAULT_ALBUM_NAME,
    lyrics,
  } = options;

  const folderPath = await downloadTrackAssets(url, name);

  setTimeout(() => {
    removeFolder(folderPath);
  }, 60000);

  return await processTrack({
    folderPath,
    name,
    album,
    lyrics,
  });
};
