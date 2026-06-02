import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import sharp from 'sharp';
import archiver from 'archiver';
import { fileURLToPath } from 'node:url';
import { getCollectionImageDir, getImagePath, listCollections, listImages } from './images.js';
import {
  completePlayRecord,
  createPlayRecord,
  getResult,
  listCollectionResults,
  saveResult,
  saveRoundSelectionDownload,
  updatePlayRecord,
  validatePlayRecordCompletePayload,
  validatePlayRecordCreatePayload,
  validateResultPayload,
} from './results.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

export function createApp({
  imageDir = path.join(projectRoot, 'imgs'),
  collectionsDir = path.join(projectRoot, 'images', 'collections'),
  dataDir = path.join(projectRoot, 'data'),
  previewDir = path.join(projectRoot, '.cache', 'previews'),
  staticDir = path.join(projectRoot, 'dist'),
} = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/images', async (req, res, next) => {
    try {
      const images = await listImages(imageDir);
      res.json({ images });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/collections', async (req, res, next) => {
    try {
      const collections = await listCollections(collectionsDir);
      res.json({ collections });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/collections/:collectionId/images', async (req, res, next) => {
    try {
      const collectionDir = await getCollectionImageDir(collectionsDir, req.params.collectionId);

      if (!collectionDir) {
        res.status(404).json({ message: '월드컵을 찾을 수 없습니다.' });
        return;
      }

      const images = await listImages(collectionDir, { urlPrefix: `/api/collections/${req.params.collectionId}/images` });
      res.json({ images });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/collections/:collectionId/results', async (req, res, next) => {
    try {
      const collectionDir = await getCollectionImageDir(collectionsDir, req.params.collectionId);

      if (!collectionDir) {
        res.status(404).json({ message: '월드컵을 찾을 수 없습니다.' });
        return;
      }

      const results = await listCollectionResults(dataDir, req.params.collectionId);
      res.json({ results });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/collections/:collectionId/images/:id/preview', async (req, res, next) => {
    try {
      const collectionDir = await getCollectionImageDir(collectionsDir, req.params.collectionId);

      if (!collectionDir) {
        res.status(404).json({ message: '월드컵을 찾을 수 없습니다.' });
        return;
      }

      await sendPreview(req, res, collectionDir, path.join(previewDir, req.params.collectionId));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/collections/:collectionId/images/:id/original', async (req, res, next) => {
    try {
      const collectionDir = await getCollectionImageDir(collectionsDir, req.params.collectionId);

      if (!collectionDir) {
        res.status(404).json({ message: '월드컵을 찾을 수 없습니다.' });
        return;
      }

      await sendOriginal(req, res, collectionDir);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/images/:id/preview', async (req, res, next) => {
    try {
      await sendPreview(req, res, imageDir, previewDir);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/images/:id/original', async (req, res, next) => {
    try {
      await sendOriginal(req, res, imageDir);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/downloads/group', async (req, res, next) => {
    try {
      const imageIds = normalizeImageIds(req.body?.imageIds);
      const label = typeof req.body?.label === 'string' && req.body.label.trim() ? req.body.label.trim() : 'images';
      const collectionId = typeof req.body?.collectionId === 'string' ? req.body.collectionId : '';
      const downloadImageDir = collectionId ? await getCollectionImageDir(collectionsDir, collectionId) : imageDir;

      if (imageIds.length === 0) {
        res.status(400).json({ message: '다운로드할 이미지가 필요합니다.' });
        return;
      }

      if (!downloadImageDir) {
        res.status(404).json({ message: '월드컵을 찾을 수 없습니다.' });
        return;
      }

      if (req.body?.downloadKind === 'round-selection') {
        const playRecordId = typeof req.body?.playRecordId === 'string' ? req.body.playRecordId.trim() : '';
        const roundSelections = normalizeRoundSelections(req.body?.roundSelections);

        if (playRecordId) {
          const playRecord = await updatePlayRecord(dataDir, playRecordId, {
            roundSelections,
          });

          if (!playRecord) {
            res.status(404).json({ message: '기록을 찾을 수 없습니다.' });
            return;
          }
        } else {
          await saveRoundSelectionDownload(dataDir, {
            nickname: req.body?.nickname,
            round: req.body?.round,
            label,
            collectionId,
            collectionName: req.body?.collectionName,
            imageIds,
            roundSelections,
          });
        }
      }

      res.type('application/zip');
      res.attachment(`${label}.zip`);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', next);
      archive.pipe(res);

      for (const id of imageIds) {
        const originalPath = await getImagePath(downloadImageDir, id);
        if (originalPath) {
          archive.file(originalPath, { name: path.basename(originalPath) });
        }
      }

      await archive.finalize();
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/play-records', async (req, res, next) => {
    try {
      const validationError = validatePlayRecordCreatePayload(req.body);

      if (validationError) {
        res.status(400).json({ message: validationError });
        return;
      }

      const record = await createPlayRecord(dataDir, req.body);
      res.status(201).json(record);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/play-records/:id', async (req, res, next) => {
    try {
      const record = await updatePlayRecord(dataDir, req.params.id, req.body);

      if (!record) {
        res.status(404).json({ message: '기록을 찾을 수 없습니다.' });
        return;
      }

      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/play-records/:id/complete', async (req, res, next) => {
    try {
      const validationError = validatePlayRecordCompletePayload(req.body);

      if (validationError) {
        res.status(400).json({ message: validationError });
        return;
      }

      const record = await completePlayRecord(dataDir, req.params.id, req.body);

      if (!record) {
        res.status(404).json({ message: '기록을 찾을 수 없습니다.' });
        return;
      }

      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/play-records/:id', async (req, res, next) => {
    try {
      const record = await getResult(dataDir, req.params.id);

      if (!record) {
        res.status(404).json({ message: '기록을 찾을 수 없습니다.' });
        return;
      }

      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/results', async (req, res, next) => {
    try {
      const validationError = validateResultPayload(req.body);

      if (validationError) {
        res.status(400).json({ message: validationError });
        return;
      }

      const result = await saveResult(dataDir, req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/results/:id', async (req, res, next) => {
    try {
      const result = await getResult(dataDir, req.params.id);

      if (!result) {
        res.status(404).json({ message: '결과를 찾을 수 없습니다.' });
        return;
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  const indexPath = path.join(staticDir, 'index.html');

  if (fsSync.existsSync(indexPath)) {
    app.use(express.static(staticDir));
    app.get(/^(?!\/api).*/, (req, res) => {
      res.sendFile(indexPath);
    });
  }

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  });

  return app;
}

async function sendPreview(req, res, imageDir, previewDir) {
  const id = decodeURIComponent(req.params.id);
  const originalPath = await getImagePath(imageDir, id);

  if (!originalPath) {
    res.status(404).json({ message: '이미지를 찾을 수 없습니다.' });
    return;
  }

  await fs.mkdir(previewDir, { recursive: true });
  const previewPath = path.join(previewDir, `${Buffer.from(id).toString('hex')}.jpg`);

  try {
    await fs.access(previewPath);
  } catch {
    try {
      await sharp(originalPath).rotate().resize({ width: 520, withoutEnlargement: true }).jpeg({ quality: 70 }).toFile(previewPath);
    } catch {
      await fs.copyFile(originalPath, previewPath);
    }
  }

  const buffer = await fs.readFile(previewPath);
  res.type('image/jpeg');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('Content-Length', String(buffer.length));
  res.send(buffer);
}

async function sendOriginal(req, res, imageDir) {
  const id = decodeURIComponent(req.params.id);
  const originalPath = await getImagePath(imageDir, id);

  if (!originalPath) {
    res.status(404).json({ message: '이미지를 찾을 수 없습니다.' });
    return;
  }

  res.download(originalPath, id);
}

function normalizeImageIds(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }
}

function normalizeRoundSelections(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
