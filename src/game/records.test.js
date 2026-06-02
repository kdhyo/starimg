import { describe, expect, test } from 'vitest';
import {
  compareSelectedRecords,
  getFilteredRecordImageIds,
  starFilterOptions,
} from './records.js';

const records = [
  {
    id: 'r1',
    nickname: '하늘',
    results: {
      1: ['a.jpg', 'b.jpg'],
      3: ['c.jpg'],
      5: ['d.jpg'],
    },
  },
  {
    id: 'r2',
    nickname: '민지',
    results: {
      2: ['a.jpg'],
      3: ['c.jpg', 'e.jpg'],
      5: ['f.jpg'],
    },
  },
  {
    id: 'r3',
    nickname: '사용자A',
    results: {
      1: ['a.jpg'],
      4: ['g.jpg'],
      5: ['d.jpg'],
    },
  },
];

describe('records comparison', () => {
  test('filters image ids by all, top, and minimum 3 stars', () => {
    expect(starFilterOptions.map((option) => option.id)).toEqual(['all', 'top', 'three-plus']);
    expect(getFilteredRecordImageIds(records[0], 'all')).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
    expect(getFilteredRecordImageIds(records[0], 'top')).toEqual(['d.jpg']);
    expect(getFilteredRecordImageIds(records[0], 'three-plus')).toEqual(['c.jpg', 'd.jpg']);
  });

  test('groups common, partial, and unique image ids for multiple records', () => {
    const comparison = compareSelectedRecords(records, 'all');

    expect(comparison.commonImageIds).toEqual(['a.jpg']);
    expect(comparison.partialImageIds).toEqual(['c.jpg', 'd.jpg']);
    expect(comparison.uniqueByRecord).toEqual([
      { recordId: 'r1', imageIds: ['b.jpg'] },
      { recordId: 'r2', imageIds: ['e.jpg', 'f.jpg'] },
      { recordId: 'r3', imageIds: ['g.jpg'] },
    ]);
  });

  test('returns single record images without overlap groups', () => {
    const comparison = compareSelectedRecords([records[0]], 'three-plus');

    expect(comparison.singleRecordImageIds).toEqual(['c.jpg', 'd.jpg']);
    expect(comparison.commonImageIds).toEqual([]);
    expect(comparison.partialImageIds).toEqual([]);
    expect(comparison.uniqueByRecord).toEqual([]);
  });

  test('ignores malformed star groups and non-string image ids', () => {
    const record = {
      id: 'malformed',
      results: {
        4: ['x.jpg', 123, 'y.jpg'],
        5: 'bad',
      },
    };

    expect(getFilteredRecordImageIds(record, 'top')).toEqual(['x.jpg', 'y.jpg']);
    expect(getFilteredRecordImageIds(record, 'all')).toEqual(['x.jpg', 'y.jpg']);
  });
});
