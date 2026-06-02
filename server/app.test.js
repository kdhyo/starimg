import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from './app.js';

let tmpDir;
let imageDir;
let collectionsDir;
let dataDir;
let staticDir;

const tinyJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=',
  'base64',
);

function parseBinaryResponse(response, callback) {
  const chunks = [];

  response.on('data', (chunk) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starimg-test-'));
  imageDir = path.join(tmpDir, 'imgs');
  collectionsDir = path.join(tmpDir, 'images', 'collections');
  dataDir = path.join(tmpDir, 'data');
  staticDir = path.join(tmpDir, 'dist');
  await fs.mkdir(imageDir);
  await fs.mkdir(path.join(collectionsDir, '스냅'), { recursive: true });
  await fs.mkdir(staticDir);
  await fs.writeFile(path.join(imageDir, 'b.jpg'), tinyJpeg);
  await fs.writeFile(path.join(imageDir, 'a.jpg'), tinyJpeg);
  await fs.writeFile(path.join(collectionsDir, '스냅', 'b.jpg'), tinyJpeg);
  await fs.writeFile(path.join(collectionsDir, '스냅', 'a.jpg'), tinyJpeg);
  await fs.writeFile(path.join(staticDir, 'index.html'), '<div id="root">wedding app</div>');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('server app', () => {
  test('serves the built frontend from the same port', async () => {
    const app = createApp({ imageDir, dataDir, staticDir });

    const response = await request(app).get('/').expect(200);

    expect(response.text).toContain('wedding app');
  });

  test('falls back to the frontend for browser routes', async () => {
    const app = createApp({ imageDir, dataDir, staticDir });

    const response = await request(app).get('/results/demo').expect(200);

    expect(response.text).toContain('wedding app');
  });

  test('returns images sorted by filename', async () => {
    const app = createApp({ imageDir, dataDir });

    const response = await request(app).get('/api/images').expect(200);

    expect(response.body.images.map((image) => image.filename)).toEqual(['a.jpg', 'b.jpg']);
    expect(response.body.images[0].previewUrl).toMatch('/api/images/');
    expect(response.body.images[0].originalUrl).toMatch('/api/images/');
  });

  test('returns collections and collection-scoped images', async () => {
    const app = createApp({ imageDir, collectionsDir, dataDir });

    const collections = await request(app).get('/api/collections').expect(200);
    const collection = collections.body.collections[0];

    expect(collection.title).toBe('스냅 월드컵');
    expect(collection.imageCount).toBe(2);

    const images = await request(app).get(`/api/collections/${collection.id}/images`).expect(200);

    expect(images.body.images.map((image) => image.filename)).toEqual(['a.jpg', 'b.jpg']);
    expect(images.body.images[0].previewUrl).toContain(`/api/collections/${collection.id}/images/`);
    expect(images.body.images[0].originalUrl).toContain(`/api/collections/${collection.id}/images/`);
  });

  test('returns collection results newest first and includes round selection downloads', async () => {
    const app = createApp({ imageDir, collectionsDir, dataDir });
    const collections = await request(app).get('/api/collections').expect(200);
    const collection = collections.body.collections[0];

    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'results.json'),
      `${JSON.stringify(
        [
          {
            id: 'old-final',
            collectionId: collection.id,
            collectionName: '스냅',
            nickname: '하늘',
            results: { 1: ['a.jpg'], 2: ['a.jpg', 'b.jpg'] },
            createdAt: '2026-06-01T09:00:00+09:00',
          },
          {
            id: 'download',
            type: 'round-selection-download',
            collectionId: collection.id,
            collectionName: '스냅',
            nickname: '하늘',
            round: 2,
            imageIds: ['a.jpg', 'a.jpg', 'b.jpg', 100],
            label: 'round-2-selected',
            createdAt: '2026-06-02T10:00:00+09:00',
          },
          {
            id: 'falsey-type',
            type: '',
            collectionId: collection.id,
            collectionName: '스냅',
            nickname: '지우',
            results: { 5: ['a.jpg'] },
            createdAt: '2026-06-03T12:00:00+09:00',
          },
          {
            id: 'other-collection',
            collectionId: 'other',
            collectionName: '다른 월드컵',
            nickname: '바다',
            results: { 5: ['z.jpg'] },
            createdAt: '2026-06-03T09:00:00+09:00',
          },
          {
            id: 'empty-final',
            collectionId: collection.id,
            collectionName: '스냅',
            nickname: '빈결과',
            results: {},
            createdAt: '2026-06-03T08:00:00+09:00',
          },
          {
            id: 'empty-download',
            type: 'round-selection-download',
            collectionId: collection.id,
            collectionName: '스냅',
            nickname: '빈다운로드',
            round: 1,
            imageIds: [],
            label: 'round-1-selected',
            createdAt: '2026-06-03T07:00:00+09:00',
          },
          {
            id: 'new-final',
            collectionId: collection.id,
            collectionName: '스냅',
            nickname: '민지',
            results: { 5: ['b.jpg'] },
            createdAt: '2026-06-02T11:00:00+09:00',
          },
        ],
        null,
        2,
      )}\n`,
    );

    const response = await request(app).get(`/api/collections/${collection.id}/results`).expect(200);

    expect(response.body.results.map((result) => result.id)).toEqual(['new-final', 'download', 'old-final']);
    expect(response.body.results[0]).toMatchObject({
      id: 'new-final',
      collectionId: collection.id,
      collectionName: '스냅',
      nickname: '민지',
      results: { 5: ['b.jpg'] },
      selectedImageCount: 1,
    });
    expect(response.body.results[1]).toMatchObject({
      id: 'download',
      type: 'round-selection-download',
      collectionId: collection.id,
      collectionName: '스냅',
      nickname: '하늘',
      round: 2,
      label: 'round-2-selected',
      results: { 1: ['a.jpg', 'b.jpg'] },
      selectedImageCount: 2,
    });
    expect(response.body.results[2].selectedImageCount).toBe(2);
  });

  test('normalizes malformed collection result groups without crashing', async () => {
    const app = createApp({ imageDir, collectionsDir, dataDir });
    const collections = await request(app).get('/api/collections').expect(200);
    const collection = collections.body.collections[0];

    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'results.json'),
      `${JSON.stringify(
        [
          {
            id: 'bad-results',
            collectionId: collection.id,
            collectionName: '스냅',
            nickname: '하늘',
            results: {
              5: ['a.jpg', 100, 'b.jpg'],
              nope: ['ignored.jpg'],
              2: 'not-array',
              '': ['empty.jpg'],
              '   ': ['blank.jpg'],
            },
            createdAt: 'not-a-date',
          },
        ],
        null,
        2,
      )}\n`,
    );

    const response = await request(app).get(`/api/collections/${collection.id}/results`).expect(200);

    expect(response.body.results).toEqual([
      {
        id: 'bad-results',
        collectionId: collection.id,
        collectionName: '스냅',
        nickname: '하늘',
        createdAt: 'not-a-date',
        results: { 5: ['a.jpg', 'b.jpg'] },
        selectedImageCount: 2,
      },
    ]);
  });

  test('returns every sorted image without a testing limit', async () => {
    for (let index = 0; index < 60; index += 1) {
      await fs.writeFile(path.join(imageDir, `${String(index).padStart(2, '0')}.jpg`), tinyJpeg);
    }
    const app = createApp({ imageDir, dataDir });

    const response = await request(app).get('/api/images').expect(200);

    expect(response.body.images).toHaveLength(62);
    expect(response.body.images[0].filename).toBe('00.jpg');
    expect(response.body.images.at(-1).filename).toBe('b.jpg');
  });

  test('serves preview images smaller than original metadata contract', async () => {
    const app = createApp({ imageDir, dataDir });
    const images = await request(app).get('/api/images').expect(200);
    const id = images.body.images[0].id;

    const response = await request(app).get(`/api/images/${id}/preview`).expect(200);

    expect(response.headers['content-type']).toMatch(/image\/jpeg/);
    expect(Number(response.headers['content-length'])).toBeGreaterThan(0);
  });

  test('downloads the original image', async () => {
    const app = createApp({ imageDir, dataDir });
    const images = await request(app).get('/api/images').expect(200);
    const id = images.body.images[0].id;

    const response = await request(app).get(`/api/images/${id}/original`).expect(200);

    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.body.length).toBe(tinyJpeg.length);
  });

  test('stores and retrieves final results', async () => {
    const app = createApp({ imageDir, dataDir });

    const created = await request(app)
      .post('/api/results')
      .send({
        collectionId: 'snap',
        collectionName: '스냅',
        nickname: '하늘',
        results: {
          5: ['a.jpg'],
          4: ['b.jpg'],
        },
      })
      .expect(201);

    const fetched = await request(app).get(`/api/results/${created.body.id}`).expect(200);

    expect(fetched.body.nickname).toBe('하늘');
    expect(fetched.body.collectionId).toBe('snap');
    expect(fetched.body.collectionName).toBe('스냅');
    expect(fetched.body.results['5']).toEqual(['a.jpg']);
    expect(fetched.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
  });

  test('creates, updates, and completes one play record', async () => {
    const app = createApp({ imageDir, collectionsDir, dataDir });
    const collections = await request(app).get('/api/collections').expect(200);
    const collection = collections.body.collections[0];

    const created = await request(app)
      .post('/api/play-records')
      .send({
        collectionId: collection.id,
        collectionName: '스냅',
        nickname: '하늘',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      status: 'in-progress',
      collectionId: collection.id,
      collectionName: '스냅',
      nickname: '하늘',
      roundSelections: [],
      results: {},
      completedAt: null,
    });
    expect(created.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
    expect(created.body.updatedAt).toBe(created.body.createdAt);

    const updated = await request(app)
      .patch(`/api/play-records/${created.body.id}`)
      .send({
        roundSelections: [
          { round: '1', imageIds: ['a.jpg'] },
          { round: '2-1', imageIds: ['b.jpg'] },
        ],
      })
      .expect(200);

    expect(updated.body.id).toBe(created.body.id);
    expect(updated.body.roundSelections).toEqual([
      { round: '1', imageIds: ['a.jpg'] },
      { round: '2-1', imageIds: ['b.jpg'] },
    ]);
    expect(updated.body.results).toEqual({
      1: ['a.jpg'],
      '2-1': ['b.jpg'],
    });

    const completed = await request(app)
      .patch(`/api/play-records/${created.body.id}/complete`)
      .send({
        roundSelections: updated.body.roundSelections,
        results: {
          4: ['b.jpg'],
          5: ['a.jpg'],
        },
      })
      .expect(200);

    expect(completed.body.id).toBe(created.body.id);
    expect(completed.body.status).toBe('completed');
    expect(completed.body.results['5']).toEqual(['a.jpg']);
    expect(completed.body.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);

    const stored = JSON.parse(await fs.readFile(path.join(dataDir, 'results.json'), 'utf8'));
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(created.body.id);
  });

  test('downloads a star group as a zip file of originals', async () => {
    const app = createApp({ imageDir, dataDir });

    const response = await request(app)
      .post('/api/downloads/group')
      .send({ imageIds: ['a.jpg'], label: '5-stars' })
      .buffer(true)
      .parse(parseBinaryResponse)
      .expect(200);

    expect(response.headers['content-type']).toMatch(/application\/zip/);
    expect(response.headers['content-disposition']).toContain('5-stars.zip');
    expect(response.body.length).toBeGreaterThan(0);
  });

  test('downloads selected round images from a browser form post', async () => {
    const app = createApp({ imageDir, collectionsDir, dataDir });
    const collections = await request(app).get('/api/collections').expect(200);
    const collection = collections.body.collections[0];

    const response = await request(app)
      .post('/api/downloads/group')
      .type('form')
      .send({
        downloadKind: 'round-selection',
        collectionId: collection.id,
        collectionName: '스냅',
        nickname: '하늘',
        round: '1',
        imageIds: JSON.stringify(['a.jpg']),
        roundSelections: JSON.stringify([{ round: 1, imageIds: ['a.jpg'] }]),
        label: 'round-1-selected',
      })
      .buffer(true)
      .parse(parseBinaryResponse)
      .expect(200);

    expect(response.headers['content-type']).toMatch(/application\/zip/);
    expect(response.headers['content-disposition']).toContain('round-1-selected.zip');
    expect(response.body.length).toBeGreaterThan(0);

    const results = JSON.parse(await fs.readFile(path.join(dataDir, 'results.json'), 'utf8'));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: 'round-selection-download',
      nickname: '하늘',
      collectionId: collection.id,
      collectionName: '스냅',
      round: 1,
      imageIds: ['a.jpg'],
      roundSelections: [{ round: '1', imageIds: ['a.jpg'] }],
      label: 'round-1-selected',
    });
    expect(results[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);

    await request(app)
      .post('/api/downloads/group')
      .type('form')
      .send({
        downloadKind: 'round-selection',
        collectionId: collection.id,
        collectionName: '스냅',
        nickname: '하늘',
        round: '1',
        imageIds: JSON.stringify(['a.jpg']),
        roundSelections: JSON.stringify([{ round: 1, imageIds: ['a.jpg'] }]),
        label: 'round-1-selected',
      })
      .buffer(true)
      .parse(parseBinaryResponse)
      .expect(200);

    const resultsAfterDuplicate = JSON.parse(await fs.readFile(path.join(dataDir, 'results.json'), 'utf8'));
    expect(resultsAfterDuplicate).toHaveLength(1);
  });

  test('updates an existing play record when selected round images are downloaded', async () => {
    const app = createApp({ imageDir, collectionsDir, dataDir });
    const collections = await request(app).get('/api/collections').expect(200);
    const collection = collections.body.collections[0];
    const created = await request(app)
      .post('/api/play-records')
      .send({ collectionId: collection.id, collectionName: '스냅', nickname: '하늘' })
      .expect(201);

    const response = await request(app)
      .post('/api/downloads/group')
      .type('form')
      .send({
        downloadKind: 'round-selection',
        playRecordId: created.body.id,
        collectionId: collection.id,
        collectionName: '스냅',
        nickname: '하늘',
        round: '2-1',
        imageIds: JSON.stringify(['a.jpg']),
        roundSelections: JSON.stringify([{ round: '2-1', imageIds: ['a.jpg'] }]),
        label: 'round-2-1-selected',
      })
      .buffer(true)
      .parse(parseBinaryResponse)
      .expect(200);

    expect(response.headers['content-type']).toMatch(/application\/zip/);

    const results = JSON.parse(await fs.readFile(path.join(dataDir, 'results.json'), 'utf8'));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: created.body.id,
      status: 'in-progress',
      roundSelections: [{ round: '2-1', imageIds: ['a.jpg'] }],
      results: { '2-1': ['a.jpg'] },
    });
  });
});
