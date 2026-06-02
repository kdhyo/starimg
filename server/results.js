import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const PlayRecordStatus = Object.freeze({
  InProgress: 'in-progress',
  Completed: 'completed',
  Abandoned: 'abandoned',
});

const playRecordStatuses = new Set(Object.values(PlayRecordStatus));

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

export async function createPlayRecord(dataDir, payload) {
  const filePath = await ensureDataFile(dataDir);
  const raw = await fs.readFile(filePath, 'utf8');
  const results = JSON.parse(raw);
  const now = formatKoreanTime(new Date());
  const record = {
    id: crypto.randomUUID(),
    status: PlayRecordStatus.InProgress,
    collectionId: typeof payload.collectionId === 'string' ? payload.collectionId : '',
    collectionName: typeof payload.collectionName === 'string' ? payload.collectionName : '',
    nickname: payload.nickname.trim(),
    roundSelections: [],
    results: {},
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  results.push(record);
  await fs.writeFile(filePath, `${JSON.stringify(results, null, 2)}\n`);

  return record;
}

export async function updatePlayRecord(dataDir, id, payload) {
  const roundSelections = payload.roundSelections ? normalizeRoundSelections(payload.roundSelections) : null;

  return updateStoredPlayRecord(dataDir, id, (record) => ({
    ...record,
    ...(roundSelections ? { roundSelections } : {}),
    ...(payload.results
      ? { results: normalizeStoredResultGroups(payload.results) }
      : roundSelections
        ? { results: normalizeRoundSelectionResults(roundSelections) }
        : {}),
    updatedAt: formatKoreanTime(new Date()),
  }));
}

export async function completePlayRecord(dataDir, id, payload) {
  return updateStoredPlayRecord(dataDir, id, (record) => ({
    ...record,
    status: PlayRecordStatus.Completed,
    roundSelections: normalizeRoundSelections(payload.roundSelections),
    results: normalizeStoredResultGroups(payload.results),
    updatedAt: formatKoreanTime(new Date()),
    completedAt: formatKoreanTime(new Date()),
  }));
}

async function updateStoredPlayRecord(dataDir, id, updater) {
  const filePath = await ensureDataFile(dataDir);
  const raw = await fs.readFile(filePath, 'utf8');
  const results = JSON.parse(raw);
  const index = results.findIndex((result) => result.id === id);

  if (index === -1) {
    return null;
  }

  const updated = updater(results[index]);
  results[index] = updated;
  await fs.writeFile(filePath, `${JSON.stringify(results, null, 2)}\n`);

  return updated;
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
      round: normalizeRoundKey(selection?.round),
      imageIds: Array.isArray(selection?.imageIds) ? selection.imageIds.filter((id) => typeof id === 'string') : [],
    }))
    .filter((selection) => selection.round);
}

function normalizeRoundKey(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return /^\d+(?:-\d+)?$/.test(trimmed) ? trimmed : '';
}

function normalizeRoundSelectionResults(roundSelections) {
  return Object.fromEntries(
    roundSelections
      .filter((selection) => selection.imageIds.length > 0)
      .map((selection) => [selection.round, selection.imageIds]),
  );
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

export async function listCollectionResults(dataDir, collectionId) {
  const filePath = await ensureDataFile(dataDir);
  const raw = await fs.readFile(filePath, 'utf8');
  const results = JSON.parse(raw);

  return results
    .filter((result) => isCollectionSelectionRecord(result, collectionId))
    .map(normalizeStoredResult)
    .filter((result) => result.selectedImageCount > 0)
    .sort(compareNewestFirst);
}

function isCollectionSelectionRecord(result, collectionId) {
  if (result?.collectionId !== collectionId) {
    return false;
  }

  return !Object.hasOwn(result, 'type') || result.type === 'round-selection-download';
}

function normalizeStoredResult(result) {
  if (result.type === 'round-selection-download') {
    return normalizeRoundSelectionDownloadResult(result);
  }

  const normalizedResults = normalizeStoredResultGroups(result.results);
  const selectedImageIds = new Set(Object.values(normalizedResults).flat());

  return {
    id: result.id,
    collectionId: result.collectionId,
    collectionName: result.collectionName,
    nickname: result.nickname,
    createdAt: result.createdAt,
    ...(Object.hasOwn(result, 'status') ? { status: normalizePlayRecordStatus(result.status) } : {}),
    ...(Object.hasOwn(result, 'updatedAt') ? { updatedAt: result.updatedAt } : {}),
    ...(Object.hasOwn(result, 'completedAt') ? { completedAt: result.completedAt } : {}),
    ...(Object.hasOwn(result, 'roundSelections') ? { roundSelections: normalizeRoundSelections(result.roundSelections) } : {}),
    results: normalizedResults,
    selectedImageCount: selectedImageIds.size,
  };
}

function normalizePlayRecordStatus(status) {
  if (playRecordStatuses.has(status)) {
    return status;
  }

  return PlayRecordStatus.Completed;
}

function normalizeRoundSelectionDownloadResult(result) {
  const imageIds = Array.isArray(result.imageIds) ? result.imageIds.filter((id) => typeof id === 'string') : [];
  const uniqueImageIds = [...new Set(imageIds)];
  const round = Number(result.round);

  return {
    id: result.id,
    type: result.type,
    collectionId: result.collectionId,
    collectionName: result.collectionName,
    nickname: result.nickname,
    createdAt: result.createdAt,
    ...(Number.isFinite(round) ? { round } : {}),
    label: typeof result.label === 'string' ? result.label : '',
    results: uniqueImageIds.length > 0 ? { 1: uniqueImageIds } : {},
    selectedImageCount: uniqueImageIds.length,
  };
}

function normalizeStoredResultGroups(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([star, imageIds]) => {
        const normalizedStar = star.trim();
        const starNumber = Number(normalizedStar);

        if (!/^\d+(?:\.\d+)?$/.test(normalizedStar) || !Number.isFinite(starNumber) || !Array.isArray(imageIds)) {
          return null;
        }

        const normalizedImageIds = imageIds.filter((id) => typeof id === 'string');
        return normalizedImageIds.length > 0 ? [normalizedStar, normalizedImageIds] : null;
      })
      .filter(Boolean),
  );
}

function compareNewestFirst(left, right) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  const leftIsValid = Number.isFinite(leftTime);
  const rightIsValid = Number.isFinite(rightTime);

  if (leftIsValid && rightIsValid) {
    return rightTime - leftTime;
  }
  if (leftIsValid) {
    return -1;
  }
  if (rightIsValid) {
    return 1;
  }

  return 0;
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

export function validatePlayRecordCreatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return '기록 데이터가 필요합니다.';
  }
  if (typeof payload.nickname !== 'string' || payload.nickname.trim().length === 0) {
    return '이름을 입력해주세요.';
  }

  return null;
}

export function validatePlayRecordCompletePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return '기록 데이터가 필요합니다.';
  }
  if (!payload.results || typeof payload.results !== 'object' || Array.isArray(payload.results)) {
    return '별점별 결과가 필요합니다.';
  }

  return null;
}
