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

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

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

const closeAgreementPopup = async (page) => {
  const agreementSelector = '.fc-button[aria-label="Consent"]';

  try {
    const agreementButton = await page.$(agreementSelector);

    if (agreementButton) {
      await agreementButton.click();
      await wait(500);

      console.info('Agreement popup closed.');
    }
  } catch (err) {
    console.error('Error closing agreement popup:', err);
  }
};

const clickElement = async (page, selector) => {
  let clicked = false;

  while (!clicked) {
    try {
      await closeAgreementPopup();

      const element = await page.$(selector);

      if (element) {
        await element.click();
        clicked = true;
        console.log(`Clicked element: ${selector}`);
      } else {
        console.log(`Element ${selector} not found.`);
        break;
      }
    } catch (error) {
      console.error(`Error clicking element ${selector}:`, error);
    }

    await wait(500);
  }
};

export const downloadTrackAssets = async (url, name = DEFAULT_TRACK_NAME) => {
  const browser = await setupBrowser();

  const page = await browser.newPage();

  const downloadFolder = `track_${getId()}`;

  console.info(`Starting download assets for track: ${name}`);

  let agreementIndervalId;

  return new Promise(async (resolve, reject) => {
    try {
      await page.goto(DOWNLOADER_URL, { waitUntil: 'networkidle2' });
      await wait(1000);

      agreementIndervalId = setInterval(async () => {
        await closeAgreementPopup(page);
      }, 2000);

      /* Type the URL into the input field */
      await page.type(DOWNLOADER_INPUT_SELECTOR, url);

      /* Click the submit button */
      await clickElement(page, DOWNLOADER_SUBMIT_SELECTOR);

      await page.screenshot({ path: 'screenshot1.png' });

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

      await page.screenshot({ path: 'screenshot2.png' });

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

      await page.screenshot({ path: 'screenshot3.png' });

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

      clearInterval(agreementIndervalId);
      resolve(downloadFolder);
    } catch (err) {
      console.error('An error occurred:', err.message);
      clearInterval(agreementIndervalId);
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
