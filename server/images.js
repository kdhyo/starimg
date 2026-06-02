import fs from 'node:fs/promises';
import path from 'node:path';

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

export function encodeCollectionId(name) {
  return Buffer.from(name).toString('base64url');
}

export async function listCollections(collectionsDir) {
  const entries = await fs.readdir(collectionsDir, { withFileTypes: true });
  const collections = [];

  for (const entry of entries.filter((item) => item.isDirectory())) {
    const imageDir = path.join(collectionsDir, entry.name);
    const images = await listImages(imageDir, { urlPrefix: `/api/collections/${encodeCollectionId(entry.name)}/images` });

    if (images.length === 0) {
      continue;
    }

    collections.push({
      id: encodeCollectionId(entry.name),
      name: entry.name.normalize('NFC'),
      title: `${entry.name.normalize('NFC')} 월드컵`,
      imageCount: images.length,
      coverPreviewUrl: images[0].previewUrl,
    });
  }

  return collections.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR', { numeric: true }));
}

export async function getCollectionImageDir(collectionsDir, collectionId) {
  const entries = await fs.readdir(collectionsDir, { withFileTypes: true });
  const collection = entries.find((entry) => entry.isDirectory() && encodeCollectionId(entry.name) === collectionId);

  return collection ? path.join(collectionsDir, collection.name) : null;
}

export async function listImages(imageDir, { urlPrefix = '/api/images' } = {}) {
  const entries = await fs.readdir(imageDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((filename) => imageExtensions.has(path.extname(filename).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'ko-KR', { numeric: true }))
    .map((filename) => ({
      id: filename,
      filename,
      previewUrl: `${urlPrefix}/${encodeURIComponent(filename)}/preview`,
      originalUrl: `${urlPrefix}/${encodeURIComponent(filename)}/original`,
    }));
}

export async function getImagePath(imageDir, id) {
  const images = await listImages(imageDir);
  const image = images.find((item) => item.id === id);

  if (!image) {
    return null;
  }

  return path.join(imageDir, image.filename);
}
