import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

async function ensureDataFile(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
  const filePath = path.join(dataDir, 'results.json');

  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, '[]\n');
  }

  return filePath;
}

export async function saveResult(dataDir, payload) {
  const filePath = await ensureDataFile(dataDir);
  const raw = await fs.readFile(filePath, 'utf8');
  const results = JSON.parse(raw);
  const record = {
    id: crypto.randomUUID(),
    collectionId: typeof payload.collectionId === 'string' ? payload.collectionId : '',
    collectionName: typeof payload.collectionName === 'string' ? payload.collectionName : '',
    nickname: payload.nickname.trim(),
    roundSelections: normalizeRoundSelections(payload.roundSelections),
    results: payload.results,
    createdAt: formatKoreanTime(new Date()),
  };

  results.push(record);
  await fs.writeFile(filePath, `${JSON.stringify(results, null, 2)}\n`);

  return record;
}

export async function saveRoundSelectionDownload(dataDir, payload) {
  const filePath = await ensureDataFile(dataDir);
  const raw = await fs.readFile(filePath, 'utf8');
  const results = JSON.parse(raw);
  const nickname = typeof payload.nickname === 'string' ? payload.nickname.trim() : '';
  const collectionId = typeof payload.collectionId === 'string' ? payload.collectionId : '';
  const round = Number(payload.round);
  const label = typeof payload.label === 'string' ? payload.label : '';
  const existing = results.find((result) => (
    result.type === 'round-selection-download'
    && result.collectionId === collectionId
    && result.nickname === nickname
    && result.round === round
    && result.label === label
  ));

  if (existing) {
    return existing;
  }

  const record = {
    id: crypto.randomUUID(),
    type: 'round-selection-download',
    nickname,
    collectionId,
    collectionName: typeof payload.collectionName === 'string' ? payload.collectionName : '',
    round,
    imageIds: Array.isArray(payload.imageIds) ? payload.imageIds : [],
    roundSelections: normalizeRoundSelections(payload.roundSelections),
    label,
    createdAt: formatKoreanTime(new Date()),
  };

  results.push(record);
  await fs.writeFile(filePath, `${JSON.stringify(results, null, 2)}\n`);

  return record;
}

function normalizeRoundSelections(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((selection) => ({
      round: Number(selection?.round),
      imageIds: Array.isArray(selection?.imageIds) ? selection.imageIds.filter((id) => typeof id === 'string') : [],
    }))
    .filter((selection) => Number.isFinite(selection.round));
}

function formatKoreanTime(date) {
  const koreanTime = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = koreanTime.getUTCFullYear();
  const month = String(koreanTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(koreanTime.getUTCDate()).padStart(2, '0');
  const hours = String(koreanTime.getUTCHours()).padStart(2, '0');
  const minutes = String(koreanTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(koreanTime.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+09:00`;
}

export async function getResult(dataDir, id) {
  const filePath = await ensureDataFile(dataDir);
  const raw = await fs.readFile(filePath, 'utf8');
  const results = JSON.parse(raw);

  return results.find((result) => result.id === id) ?? null;
}

export function validateResultPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return '결과 데이터가 필요합니다.';
  }
  if (typeof payload.nickname !== 'string' || payload.nickname.trim().length === 0) {
    return '이름을 입력해주세요.';
  }
  if (!payload.results || typeof payload.results !== 'object' || Array.isArray(payload.results)) {
    return '별점별 결과가 필요합니다.';
  }

  return null;
}
