import { describe, expect, test } from 'vitest';
import {
  createGameState,
  excludeSelectedImages,
  finishBatch,
  getCurrentBatch,
  groupByStars,
  mergeUniqueImages,
} from './engine.js';

const images = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((id) => ({ id, filename: `${id}.jpg` }));

describe('game engine', () => {
  test('returns the current batch using the fixed group size', () => {
    const state = createGameState(images);

    expect(getCurrentBatch(state).map((image) => image.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
  });

  test('eliminates unselected images and gives selected images one star', () => {
    const state = createGameState(images);
    const next = finishBatch(state, ['a', 'c']);

    expect(next.eliminatedIds).toEqual(['b', 'd', 'e', 'f', 'g', 'h', 'i']);
    expect(next.scores.a).toBe(1);
    expect(next.scores.c).toBe(1);
    expect(next.nextCandidates.map((image) => image.id)).toEqual(['a', 'c']);
  });

  test('handles a final partial batch smaller than the group size', () => {
    const state = createGameState(images);
    const afterFirst = finishBatch(state, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
    const afterSecond = finishBatch(afterFirst, ['j']);

    expect(afterSecond.round).toBe(2);
    expect(afterSecond.currentCandidates.map((image) => image.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
      'j',
    ]);
    expect(afterSecond.scores.j).toBe(1);
  });

  test('starts a new loop with only survivors after all images have been processed', () => {
    const state = createGameState(images);
    const afterFirst = finishBatch(state, ['a', 'c']);
    const afterSecond = finishBatch(afterFirst, ['j']);

    expect(afterSecond.round).toBe(2);
    expect(afterSecond.cursor).toBe(0);
    expect(afterSecond.currentCandidates.map((image) => image.id)).toEqual(['a', 'c', 'j']);
  });

  test('does not finish with one selected image while unseen images remain', () => {
    const state = createGameState(images);
    const next = finishBatch(state, ['a']);

    expect(next.finished).toBe(false);
    expect(next.nextCandidates.map((image) => image.id)).toEqual(['a']);
    expect(getCurrentBatch(next).map((image) => image.id)).toEqual(['j']);
  });

  test('allows skipping a batch with no selected images', () => {
    const state = createGameState(images);
    const next = finishBatch(state, []);

    expect(next.finished).toBe(false);
    expect(next.eliminatedIds).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
    expect(next.nextCandidates).toEqual([]);
    expect(getCurrentBatch(next).map((image) => image.id)).toEqual(['j']);
  });

  test('finishes when only one image survives', () => {
    const state = createGameState([images[0], images[1]]);
    const next = finishBatch(state, ['a']);

    expect(next.finished).toBe(true);
    expect(next.finishReason).toBe('single-winner');
  });

  test('finishes when an image reaches five stars', () => {
    const state = {
      ...createGameState([images[0], images[1]]),
      scores: { a: 4, b: 4 },
    };
    const next = finishBatch(state, ['a']);

    expect(next.finished).toBe(true);
    expect(next.finishReason).toBe('max-stars');
    expect(next.scores.a).toBe(5);
  });

  test('groups results from five stars down to one star', () => {
    const grouped = groupByStars({ a: 5, b: 2, c: 4, d: 0 }, images);
    const sortedStars = Object.keys(grouped).sort((a, b) => Number(b) - Number(a));

    expect(sortedStars).toEqual(['5', '4', '2']);
    expect(grouped['5'][0].id).toBe('a');
    expect(grouped['4'][0].id).toBe('c');
  });

  test('excludes already selected images from additional selection candidates', () => {
    const remaining = excludeSelectedImages(images, [images[0], images[2]]);

    expect(remaining.map((image) => image.id)).toEqual(['b', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
  });

  test('merges additional selections without duplicating image ids', () => {
    const merged = mergeUniqueImages([images[0], images[2]], [images[2], images[4]]);

    expect(merged.map((image) => image.id)).toEqual(['a', 'c', 'e']);
  });
});
