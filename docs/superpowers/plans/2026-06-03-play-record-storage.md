# Play Record Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store one play record per started game and update that same id through round downloads, extra selections, and final completion.

**Architecture:** Keep persistence in `server/results.js`, but rename the public API surface to play records. The client creates a play record on game start, sends `playRecordId` with round downloads, and completes the same record at the end.

**Tech Stack:** Vite React, Express, ESM JavaScript, Vitest, Supertest.

---

## File Structure

- Modify `server/results.js`: add `PlayRecordStatus`, create/update/complete helpers, string round normalization, and compatibility normalization.
- Modify `server/app.js`: add `/api/play-records` routes and update `/api/downloads/group` to update an existing play record.
- Modify `server/app.test.js`: cover play record lifecycle and download updates.
- Modify `src/App.jsx`: rename saved result state to play record state, create record on start, submit `playRecordId`, and complete by id.
- Modify `src/App.test.jsx`: update fetch expectations and submitted form assertions.
- Modify `src/game/records.js` and tests only if normalization needs client-side status handling.

### Task 1: Server Play Record Helpers

**Files:**
- Modify: `server/results.js`
- Test: `server/app.test.js`

- [ ] **Step 1: Write failing server lifecycle tests**

Add tests in `server/app.test.js` for:

```js
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
```

- [ ] **Step 2: Run failing server test**

Run: `pnpm test server/app.test.js -- --runInBand`

Expected: fail because `/api/play-records` routes do not exist.

- [ ] **Step 3: Implement helpers**

In `server/results.js`, add:

```js
export const PlayRecordStatus = Object.freeze({
  InProgress: 'in-progress',
  Completed: 'completed',
  Abandoned: 'abandoned',
});
```

Add helper functions:

```js
export async function createPlayRecord(dataDir, payload) {}
export async function updatePlayRecord(dataDir, id, payload) {}
export async function completePlayRecord(dataDir, id, payload) {}
```

Implement them by reading `results.json`, finding by `id`, normalizing `roundSelections` with string round keys, updating `updatedAt`, and writing the array back.

- [ ] **Step 4: Run server test**

Run: `pnpm test server/app.test.js`

Expected: play record lifecycle test passes after routes are added in Task 2.

### Task 2: Server Routes and Download Updates

**Files:**
- Modify: `server/app.js`
- Modify: `server/results.js`
- Test: `server/app.test.js`

- [ ] **Step 1: Write failing download update test**

Replace the old expectation that a `round-selection-download` record is created when a play record id is submitted:

```js
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
  });
});
```

- [ ] **Step 2: Add routes**

In `server/app.js`, import the new helpers and add:

```js
app.post('/api/play-records', async (req, res, next) => {});
app.patch('/api/play-records/:id', async (req, res, next) => {});
app.patch('/api/play-records/:id/complete', async (req, res, next) => {});
app.get('/api/play-records/:id', async (req, res, next) => {});
```

Return `404` with `{ message: '기록을 찾을 수 없습니다.' }` when an update target is missing.

- [ ] **Step 3: Update download endpoint**

In `/api/downloads/group`, when `downloadKind === 'round-selection'` and `playRecordId` is present, call `updatePlayRecord` with normalized round selections. If `playRecordId` is absent, keep the existing `saveRoundSelectionDownload` compatibility behavior.

- [ ] **Step 4: Run server tests**

Run: `pnpm test server/app.test.js`

Expected: all server tests pass.

### Task 3: Client Play Record Flow

**Files:**
- Modify: `src/App.jsx`
- Test: `src/App.test.jsx`

- [ ] **Step 1: Write failing client expectations**

Update tests so game start expects:

```js
expect(global.fetch).toHaveBeenCalledWith(
  '/api/play-records',
  expect.objectContaining({
    method: 'POST',
    body: expect.stringContaining('"nickname"'),
  }),
);
```

Update the final save expectation to `/api/play-records/<id>/complete`, and update round download form assertions:

```js
expect(submittedForms[0].querySelector('[name="playRecordId"]')).toHaveValue('play-record-1');
```

- [ ] **Step 2: Create record on start**

In `src/App.jsx`, replace `savedResultId` with `playRecordId`. In `startGame`, after image loading succeeds, call:

```js
const recordResponse = await fetch('/api/play-records', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    collectionId: collectionOverride.id,
    collectionName: collectionOverride.name,
    nickname: trimmedName,
  }),
});
```

Store `record.id` in state before setting the game state.

- [ ] **Step 3: Complete record on finish**

Change the finish effect from `POST /api/results` to:

```js
fetch(`/api/play-records/${playRecordId}/complete`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    roundSelections,
    results: resultPayload,
  }),
});
```

- [ ] **Step 4: Send playRecordId with round downloads**

In `downloadRoundSelection`, include:

```js
playRecordId: playRecordId ?? '',
round: roundIntro.completedRound,
roundSelections: JSON.stringify(roundIntro.roundSelections ?? []),
```

For extra selection download labels, use the same `round` value stored in `roundSelections`.

- [ ] **Step 5: Run client tests**

Run: `pnpm test src/App.test.jsx`

Expected: all client tests pass.

### Task 4: Compatibility and Full Verification

**Files:**
- Modify: `server/results.js`
- Test: `server/app.test.js`
- Test: `src/game/records.test.js`

- [ ] **Step 1: Verify old records still list**

Keep `normalizeStoredResult` treating records with no `status` as completed final results, and existing `type: 'round-selection-download'` as legacy visible download records.

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 3: Run production build**

Run: `pnpm build`

Expected: Vite build completes successfully.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add server/results.js server/app.js server/app.test.js src/App.jsx src/App.test.jsx src/game/records.js src/game/records.test.js docs/superpowers/plans/2026-06-03-play-record-storage.md
git commit -m "feat: store play records by session"
```
