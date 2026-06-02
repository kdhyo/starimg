export const starFilterOptions = [
  { id: 'all', label: '전체 선택' },
  { id: 'top', label: '최고 별점만' },
  { id: 'three-plus', label: '별 3개 이상' },
];

const emptyComparison = () => ({
  singleRecordImageIds: [],
  commonImageIds: [],
  partialImageIds: [],
  uniqueByRecord: [],
});

const getUniqueImageIds = (imageIds) => {
  const seen = new Set();

  return imageIds.filter((imageId) => {
    if (seen.has(imageId)) {
      return false;
    }

    seen.add(imageId);
    return true;
  });
};

const getStarGroups = (record) => {
  if (!record?.results || typeof record.results !== 'object' || Array.isArray(record.results)) {
    return [];
  }

  return Object.entries(record.results)
    .filter(([, imageIds]) => Array.isArray(imageIds))
    .map(([star, imageIds]) => ({
      star: Number(star),
      imageIds: imageIds.filter((imageId) => typeof imageId === 'string'),
    }))
    .filter((group) => Number.isFinite(group.star))
    .sort((a, b) => a.star - b.star);
};

export const getFilteredRecordImageIds = (record, filterId) => {
  const starGroups = getStarGroups(record);

  if (record?.type === 'round-selection-download') {
    return getUniqueImageIds(starGroups.flatMap((group) => group.imageIds));
  }

  if (filterId === 'top') {
    const topGroup = starGroups.at(-1);
    return getUniqueImageIds(topGroup?.imageIds ?? []);
  }

  if (filterId === 'three-plus') {
    return getUniqueImageIds(
      starGroups
        .filter((group) => group.star >= 3)
        .flatMap((group) => group.imageIds),
    );
  }

  return getUniqueImageIds(starGroups.flatMap((group) => group.imageIds));
};

export const compareSelectedRecords = (records, filterId) => {
  if (!Array.isArray(records) || records.length === 0) {
    return emptyComparison();
  }

  if (records.length === 1) {
    return {
      ...emptyComparison(),
      singleRecordImageIds: getFilteredRecordImageIds(records[0], filterId),
    };
  }

  const imageCounts = new Map();
  const imageOrder = [];
  const imageIdsByRecord = records.map((record) => getFilteredRecordImageIds(record, filterId));

  imageIdsByRecord.forEach((imageIds) => {
    imageIds.forEach((imageId) => {
      if (!imageCounts.has(imageId)) {
        imageCounts.set(imageId, 0);
        imageOrder.push(imageId);
      }

      imageCounts.set(imageId, imageCounts.get(imageId) + 1);
    });
  });

  const commonImageIds = imageOrder.filter((imageId) => imageCounts.get(imageId) === records.length);
  const partialImageIds = imageOrder.filter((imageId) => {
    const count = imageCounts.get(imageId);
    return count >= 2 && count < records.length;
  });
  const uniqueByRecord = records.map((record, index) => ({
    recordId: record?.id,
    imageIds: imageIdsByRecord[index].filter((imageId) => imageCounts.get(imageId) === 1),
  }));

  return {
    singleRecordImageIds: [],
    commonImageIds,
    partialImageIds,
    uniqueByRecord,
  };
};
