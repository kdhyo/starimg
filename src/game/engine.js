export const mobileItemsPerBatch = 9;
export const desktopItemsPerBatch = 10;
export const itemsPerBatch = mobileItemsPerBatch;

export function createGameState(images, batchSize = itemsPerBatch) {
  return {
    itemsPerBatch: batchSize,
    round: 1,
    cursor: 0,
    currentCandidates: [...images],
    nextCandidates: [],
    scores: Object.fromEntries(images.map((image) => [image.id, 0])),
    eliminatedIds: [],
    finished: images.length <= 1,
    finishReason: images.length <= 1 ? 'single-winner' : null,
  };
}

export function getCurrentBatch(state) {
  return state.currentCandidates.slice(state.cursor, state.cursor + state.itemsPerBatch);
}

export function finishBatch(state, selectedIds) {
  if (state.finished) {
    return state;
  }

  const selectedSet = new Set(selectedIds);
  const batch = getCurrentBatch(state);
  const selectedImages = batch.filter((image) => selectedSet.has(image.id));
  const eliminatedIds = batch.filter((image) => !selectedSet.has(image.id)).map((image) => image.id);
  const scores = { ...state.scores };

  for (const image of selectedImages) {
    scores[image.id] = (scores[image.id] ?? 0) + 1;
  }

  const nextCandidates = [...state.nextCandidates, ...selectedImages];
  const nextCursor = state.cursor + state.itemsPerBatch;
  const reachedMaxStars = selectedImages.some((image) => scores[image.id] >= 5);
  const processedAll = nextCursor >= state.currentCandidates.length;

  if (reachedMaxStars) {
    return {
      ...state,
      scores,
      eliminatedIds,
      nextCandidates,
      cursor: nextCursor,
      finished: true,
      finishReason: 'max-stars',
    };
  }

  if (processedAll && nextCandidates.length <= 1) {
    return {
      ...state,
      scores,
      eliminatedIds,
      nextCandidates,
      cursor: nextCursor,
      finished: true,
      finishReason: 'single-winner',
    };
  }

  if (processedAll) {
    return {
      ...state,
      round: state.round + 1,
      cursor: 0,
      currentCandidates: nextCandidates,
      nextCandidates: [],
      scores,
      eliminatedIds,
    };
  }

  return {
    ...state,
    cursor: nextCursor,
    nextCandidates,
    scores,
    eliminatedIds,
  };
}

export function groupByStars(scores, images) {
  const imageById = new Map(images.map((image) => [image.id, image]));
  const grouped = {};

  Object.entries(scores)
    .filter(([, stars]) => stars > 0)
    .sort(([, starsA], [, starsB]) => starsB - starsA)
    .forEach(([id, stars]) => {
      grouped[stars] ??= [];
      grouped[stars].push(imageById.get(id) ?? { id, filename: id });
    });

  return grouped;
}

export function excludeSelectedImages(candidates, selectedImages) {
  const selectedIds = new Set(selectedImages.map((image) => image.id));

  return candidates.filter((image) => !selectedIds.has(image.id));
}

export function mergeUniqueImages(existingImages, additionalImages) {
  const merged = [];
  const seenIds = new Set();

  for (const image of [...existingImages, ...additionalImages]) {
    if (seenIds.has(image.id)) {
      continue;
    }

    seenIds.add(image.id);
    merged.push(image);
  }

  return merged;
}
