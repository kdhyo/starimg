# Selection Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a collection-scoped `선택 기록` page where users can view saved final play records, select multiple records, filter by star level, and compare overlapping and unique images.

**Architecture:** Add a collection-scoped server endpoint that returns normalized final result records. Keep comparison math in a small pure client module, then add a lightweight URL-driven records view to the existing React app without introducing React Router. Use existing preview/original image APIs and the current modal/image-grid visual patterns.

**Tech Stack:** Express 5, Node ESM, React 19, Vite, Vitest, Testing Library, Supertest, Playwright/manual browser verification for mobile layout.

---

## File Structure

- Modify `server/results.js`: add helpers to read all results, normalize final result groups, compute unique selected image count, and list collection results newest first.
- Modify `server/app.js`: add `GET /api/collections/:collectionId/results`.
- Modify `server/app.test.js`: cover the new endpoint filtering, sorting, exclusion, and malformed result behavior.
- Create `src/game/records.js`: pure functions for star filtering and overlap grouping.
- Create `src/game/records.test.js`: unit tests for comparison behavior independent of React.
- Modify `src/App.jsx`: add URL-driven records view, main card `선택 기록 보기` action, records page state, record selection, star filter, nickname search, image modal behavior.
- Modify `src/App.test.jsx`: cover entry navigation, newest-first record rendering, comparison groups, and filter recomputation.
- Modify `src/styles.css`: add main card footer, records page layout, record rows, comparison sections, and mobile responsive rules.

---

### Task 1: Server Records Endpoint

**Files:**
- Modify: `server/results.js`
- Modify: `server/app.js`
- Test: `server/app.test.js`

- [ ] **Step 1: Add failing server tests**

Add these tests inside `describe('server app', () => { ... })` in `server/app.test.js`.

```js
  test('returns collection final results newest first and excludes download records', async () => {
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
            imageIds: ['a.jpg'],
            createdAt: '2026-06-02T10:00:00+09:00',
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

    expect(response.body.results.map((result) => result.id)).toEqual(['new-final', 'old-final']);
    expect(response.body.results[0]).toMatchObject({
      id: 'new-final',
      collectionId: collection.id,
      collectionName: '스냅',
      nickname: '민지',
      results: { 5: ['b.jpg'] },
      selectedImageCount: 1,
    });
    expect(response.body.results[1].selectedImageCount).toBe(2);
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
```

- [ ] **Step 2: Run server tests to verify failure**

Run:

```bash
pnpm test server/app.test.js
```

Expected: FAIL with 404 for `GET /api/collections/:collectionId/results`.

- [ ] **Step 3: Implement result listing helpers**

In `server/results.js`, add these exports after `saveRoundSelectionDownload`.

```js
export async function listCollectionResults(dataDir, collectionId) {
  const filePath = await ensureDataFile(dataDir);
  const raw = await fs.readFile(filePath, 'utf8');
  const results = JSON.parse(raw);

  return results
    .filter((result) => !result.type && result.collectionId === collectionId)
    .map(normalizeStoredResult)
    .sort((a, b) => compareCreatedAtDesc(a.createdAt, b.createdAt));
}

function normalizeStoredResult(result) {
  const normalizedResults = normalizeResults(result.results);

  return {
    id: typeof result.id === 'string' ? result.id : '',
    collectionId: typeof result.collectionId === 'string' ? result.collectionId : '',
    collectionName: typeof result.collectionName === 'string' ? result.collectionName : '',
    nickname: typeof result.nickname === 'string' ? result.nickname : '',
    createdAt: typeof result.createdAt === 'string' ? result.createdAt : '',
    results: normalizedResults,
    selectedImageCount: countUniqueImages(normalizedResults),
  };
}

function normalizeResults(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([stars, imageIds]) => Number.isFinite(Number(stars)) && Array.isArray(imageIds))
      .map(([stars, imageIds]) => [
        stars,
        imageIds.filter((imageId) => typeof imageId === 'string'),
      ])
      .filter(([, imageIds]) => imageIds.length > 0),
  );
}

function countUniqueImages(results) {
  return new Set(Object.values(results).flat()).size;
}

function compareCreatedAtDesc(a, b) {
  const first = Date.parse(a);
  const second = Date.parse(b);
  const normalizedFirst = Number.isFinite(first) ? first : Number.NEGATIVE_INFINITY;
  const normalizedSecond = Number.isFinite(second) ? second : Number.NEGATIVE_INFINITY;

  return normalizedSecond - normalizedFirst;
}
```

- [ ] **Step 4: Add the endpoint**

In `server/app.js`, update the import:

```js
import { getResult, listCollectionResults, saveResult, saveRoundSelectionDownload, validateResultPayload } from './results.js';
```

Add this route after `app.get('/api/collections/:collectionId/images', ...)` and before image preview routes:

```js
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
```

- [ ] **Step 5: Run server tests to verify pass**

Run:

```bash
pnpm test server/app.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit server endpoint**

```bash
git add server/results.js server/app.js server/app.test.js
git commit -m "feat: add collection selection records API"
```

---

### Task 2: Pure Record Comparison Logic

**Files:**
- Create: `src/game/records.js`
- Create: `src/game/records.test.js`

- [ ] **Step 1: Add failing comparison tests**

Create `src/game/records.test.js`.

```js
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
});
```

- [ ] **Step 2: Run comparison tests to verify failure**

Run:

```bash
pnpm test src/game/records.test.js
```

Expected: FAIL because `src/game/records.js` does not exist.

- [ ] **Step 3: Implement comparison helpers**

Create `src/game/records.js`.

```js
export const starFilterOptions = [
  { id: 'all', label: '전체 선택' },
  { id: 'top', label: '최고 별점만' },
  { id: 'three-plus', label: '별 3개 이상' },
];

export function getFilteredRecordImageIds(record, filterId) {
  const groups = normalizeRecordGroups(record?.results);
  const entries = Object.entries(groups)
    .map(([stars, imageIds]) => [Number(stars), imageIds])
    .filter(([stars]) => Number.isFinite(stars))
    .sort(([a], [b]) => a - b);

  if (filterId === 'top') {
    const topStars = entries.at(-1)?.[0];
    return topStars ? unique(entries.find(([stars]) => stars === topStars)?.[1] ?? []) : [];
  }

  if (filterId === 'three-plus') {
    return unique(entries.filter(([stars]) => stars >= 3).flatMap(([, imageIds]) => imageIds));
  }

  return unique(entries.flatMap(([, imageIds]) => imageIds));
}

export function compareSelectedRecords(records, filterId) {
  const recordImageSets = records.map((record) => ({
    record,
    imageIds: getFilteredRecordImageIds(record, filterId),
  }));

  if (recordImageSets.length === 0) {
    return emptyComparison();
  }

  if (recordImageSets.length === 1) {
    return {
      ...emptyComparison(),
      singleRecordImageIds: recordImageSets[0].imageIds,
    };
  }

  const counts = new Map();

  for (const { imageIds } of recordImageSets) {
    for (const imageId of imageIds) {
      counts.set(imageId, (counts.get(imageId) ?? 0) + 1);
    }
  }

  const selectedCount = recordImageSets.length;
  const commonImageIds = [];
  const partialImageIds = [];

  for (const [imageId, count] of counts) {
    if (count === selectedCount) {
      commonImageIds.push(imageId);
    } else if (count >= 2) {
      partialImageIds.push(imageId);
    }
  }

  const uniqueByRecord = recordImageSets.map(({ record, imageIds }) => ({
    recordId: record.id,
    imageIds: imageIds.filter((imageId) => counts.get(imageId) === 1),
  }));

  return {
    singleRecordImageIds: [],
    commonImageIds,
    partialImageIds,
    uniqueByRecord,
  };
}

function normalizeRecordGroups(results) {
  if (!results || typeof results !== 'object' || Array.isArray(results)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(results)
      .filter(([, imageIds]) => Array.isArray(imageIds))
      .map(([stars, imageIds]) => [stars, imageIds.filter((imageId) => typeof imageId === 'string')]),
  );
}

function unique(values) {
  return [...new Set(values)];
}

function emptyComparison() {
  return {
    singleRecordImageIds: [],
    commonImageIds: [],
    partialImageIds: [],
    uniqueByRecord: [],
  };
}
```

- [ ] **Step 4: Run comparison tests to verify pass**

Run:

```bash
pnpm test src/game/records.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit comparison helpers**

```bash
git add src/game/records.js src/game/records.test.js
git commit -m "feat: add selection record comparison helpers"
```

---

### Task 3: Main Page Entry and URL View Skeleton

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add failing UI tests for entry navigation**

Add test data for records to `src/App.test.jsx` near `collections`.

```js
const collectionResults = [
  {
    id: 'result-new',
    collectionId: 'snap',
    collectionName: '스냅',
    nickname: '민지',
    createdAt: '2026-06-02T11:00:00+09:00',
    results: { 5: ['a.jpg'] },
    selectedImageCount: 1,
  },
];
```

Extend the `global.fetch` mock in `beforeEach`:

```js
    if (url === '/api/collections/snap/results') {
      return Response.json({ results: collectionResults });
    }
```

Add this test near the existing start-screen tests:

```js
  test('opens selection records from a collection card action', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: '스냅 월드컵' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '스냅 월드컵 선택 기록 보기' }));

    expect(await screen.findByRole('heading', { name: '선택 기록' })).toBeInTheDocument();
    expect(screen.getByText('사람별 플레이 기록을 선택해 겹치는 이미지와 각자만 고른 이미지를 비교합니다.')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run UI tests to verify failure**

Run:

```bash
pnpm test src/App.test.jsx
```

Expected: FAIL because `선택 기록 보기` does not exist.

- [ ] **Step 3: Add URL view state and navigation helpers**

In `src/App.jsx`, add state after `expandedImage`:

```js
  const [recordsViewCollectionId, setRecordsViewCollectionId] = useState(() => getRecordsRouteCollectionId());
```

Add helpers below imports:

```js
function getRecordsRouteCollectionId() {
  const match = window.location.pathname.match(/^\/collections\/([^/]+)\/records$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function pushPath(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event('popstate'));
}
```

Add this effect after the collections-loading effect:

```js
  useEffect(() => {
    function syncRoute() {
      setRecordsViewCollectionId(getRecordsRouteCollectionId());
    }

    window.addEventListener('popstate', syncRoute);

    return () => window.removeEventListener('popstate', syncRoute);
  }, []);
```

Refactor `startGame` so it can start from a collection-card action or the existing form submit.

Change the function signature:

```js
  async function startGame(event, collectionOverride = selectedCollection) {
    event?.preventDefault();
    const trimmedName = nickname.trim();

    if (!collectionOverride) {
      setError('월드컵을 선택해주세요.');
      return;
    }
```

Inside that function, replace all remaining `selectedCollection` reads for the game being started with `collectionOverride`:

```js
      const response = await fetch(`/api/collections/${collectionOverride.id}/images`);
```

At the top of the successful load block, keep the selected collection synchronized:

```js
      setSelectedCollection(collectionOverride);
```

In the final result-saving effect, keep `selectedCollection` as-is. Starting from a card action sets it before the game finishes, so the existing save payload remains correct.

Add these functions near `resetGame`:

```js
  function openRecordsView(collection) {
    pushPath(`/collections/${encodeURIComponent(collection.id)}/records`);
  }

  function startGameFromCollection(collection) {
    setSelectedCollection(collection);
    startGame(null, collection);
  }

  function closeRecordsView() {
    pushPath('/');
  }
```

- [ ] **Step 4: Add temporary records page skeleton**

Before `if (gameState?.finished)`, add:

```jsx
  if (recordsViewCollectionId) {
    const recordsCollection = collections.find((collection) => collection.id === recordsViewCollectionId);

    return (
      <main className="records-page">
        <section className="records-header">
          <div>
            <p className="eyebrow">{recordsCollection?.title ?? '이미지 월드컵'}</p>
            <h1>선택 기록</h1>
            <p>사람별 플레이 기록을 선택해 겹치는 이미지와 각자만 고른 이미지를 비교합니다.</p>
          </div>
          <button type="button" className="secondary-button" onClick={closeRecordsView}>
            메인으로
          </button>
        </section>
      </main>
    );
  }
```

- [ ] **Step 5: Add collection card footer actions**

Replace the `collection-card` button in the start screen with an `article` that keeps selection and adds explicit actions:

```jsx
              <article
                className={`collection-card ${selectedCollection?.id === collection.id ? 'selected' : ''}`}
                key={collection.id}
              >
                <button
                  type="button"
                  className="collection-select-button"
                  onClick={() => setSelectedCollection(collection)}
                  disabled={isLoading}
                >
                  <img src={collection.coverPreviewUrl} alt="" />
                  <span>{collection.title}</span>
                  <small>{collection.imageCount}장</small>
                </button>
                <div className="collection-card-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => startGameFromCollection(collection)}
                    disabled={isLoading}
                    aria-label={`${collection.title} 시작`}
                  >
                    시작
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => openRecordsView(collection)}
                    disabled={isLoading}
                    aria-label={`${collection.title} 선택 기록 보기`}
                  >
                    선택 기록 보기
                  </button>
                </div>
              </article>
```

- [ ] **Step 6: Add CSS for card footer and skeleton page**

In `src/styles.css`, adapt `.collection-card` so the outer article is not the clickable element:

```css
.collection-card {
  width: 100%;
  min-width: 0;
  display: grid;
  gap: 8px;
  border: 1px solid #d1d9df;
  border-radius: 8px;
  padding: 8px;
  background: #ffffff;
  color: #1f2930;
}

.collection-select-button {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  grid-template-rows: auto auto;
  gap: 2px 10px;
  align-items: center;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.collection-card-actions {
  display: grid;
  grid-template-columns: minmax(88px, 0.7fr) minmax(0, 1.3fr);
  gap: 8px;
}

.collection-card-actions .secondary-button {
  min-width: 0;
  width: 100%;
  padding: 0 10px;
  white-space: normal;
}
```

Update the old `.collection-card img`, `.collection-card span`, and `.collection-card small` selectors to target `.collection-select-button`.

Add:

```css
.records-page {
  width: min(1200px, 100%);
  margin: 0 auto;
  padding: 18px;
}

.records-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.records-header h1,
.records-header p {
  margin: 0;
}

.records-header h1 {
  color: #151719;
  font-size: clamp(28px, 6vw, 46px);
  line-height: 1.08;
  letter-spacing: 0;
}

.records-header p:not(.eyebrow) {
  margin-top: 6px;
  color: #5d666f;
  font-weight: 700;
}
```

- [ ] **Step 7: Run UI tests to verify pass**

Run:

```bash
pnpm test src/App.test.jsx
```

Expected: PASS.

This task intentionally uses a collection-specific aria label such as `스냅 월드컵 시작` for collection-card start buttons so existing tests and users can still distinguish the global form submit button named `시작`.

- [ ] **Step 8: Commit entry skeleton**

```bash
git add src/App.jsx src/App.test.jsx src/styles.css
git commit -m "feat: add selection records entry point"
```

---

### Task 4: Records Page Loading and Record List

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add failing tests for newest-first records and default selection**

In `src/App.test.jsx`, replace `collectionResults` with:

```js
const collectionResults = [
  {
    id: 'result-new',
    collectionId: 'snap',
    collectionName: '스냅',
    nickname: '민지',
    createdAt: '2026-06-02T11:00:00+09:00',
    results: { 5: ['a.jpg'], 3: ['b.jpg'] },
    selectedImageCount: 2,
  },
  {
    id: 'result-middle',
    collectionId: 'snap',
    collectionName: '스냅',
    nickname: '하늘',
    createdAt: '2026-06-02T10:00:00+09:00',
    results: { 5: ['a.jpg'], 2: ['c.jpg'] },
    selectedImageCount: 2,
  },
  {
    id: 'result-old',
    collectionId: 'snap',
    collectionName: '스냅',
    nickname: '사용자A',
    createdAt: '2026-06-01T09:00:00+09:00',
    results: { 5: ['a.jpg'], 4: ['d.jpg'] },
    selectedImageCount: 2,
  },
];
```

Add:

```js
  test('renders records newest first and selects latest three by default', async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: '스냅 월드컵 선택 기록 보기' }));

    const recordCheckboxes = await screen.findAllByRole('checkbox');

    expect(recordCheckboxes.map((checkbox) => checkbox.closest('label').textContent)).toEqual([
      expect.stringContaining('민지'),
      expect.stringContaining('하늘'),
      expect.stringContaining('사용자A'),
    ]);
    expect(screen.getByText('3개 기록 비교')).toBeInTheDocument();
    expect(screen.getByLabelText('이름 검색')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /민지/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /하늘/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /사용자A/ })).toBeChecked();
  });
```

- [ ] **Step 2: Run UI tests to verify failure**

Run:

```bash
pnpm test src/App.test.jsx
```

Expected: FAIL because the records list is not implemented.

- [ ] **Step 3: Add records page state and loader**

In `src/App.jsx`, add state:

```js
  const [recordImages, setRecordImages] = useState([]);
  const [recordResults, setRecordResults] = useState([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState(new Set());
  const [recordSearch, setRecordSearch] = useState('');
  const [recordsError, setRecordsError] = useState('');
  const [recordsLoading, setRecordsLoading] = useState(false);
```

Add this effect:

```js
  useEffect(() => {
    if (!recordsViewCollectionId) {
      return;
    }

    let ignore = false;

    async function loadRecordsView() {
      setRecordsLoading(true);
      setRecordsError('');
      setRecordImages([]);
      setRecordResults([]);
      setSelectedRecordIds(new Set());

      try {
        const [imagesResponse, resultsResponse] = await Promise.all([
          fetch(`/api/collections/${recordsViewCollectionId}/images`),
          fetch(`/api/collections/${recordsViewCollectionId}/results`),
        ]);

        if (!imagesResponse.ok || !resultsResponse.ok) {
          throw new Error('선택 기록을 불러오지 못했습니다.');
        }

        const [imagesData, resultsData] = await Promise.all([
          imagesResponse.json(),
          resultsResponse.json(),
        ]);

        if (ignore) {
          return;
        }

        const nextResults = resultsData.results ?? [];
        setRecordImages(imagesData.images ?? []);
        setRecordResults(nextResults);
        setSelectedRecordIds(new Set(nextResults.slice(0, 3).map((record) => record.id)));
      } catch (loadError) {
        if (!ignore) {
          setRecordsError(loadError.message);
        }
      } finally {
        if (!ignore) {
          setRecordsLoading(false);
        }
      }
    }

    loadRecordsView();

    return () => {
      ignore = true;
    };
  }, [recordsViewCollectionId]);
```

Add:

```js
  function toggleRecord(recordId) {
    setSelectedRecordIds((previous) => {
      const next = new Set(previous);

      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }

      return next;
    });
  }
```

- [ ] **Step 4: Render record list**

Inside the records view branch, derive:

```js
    const filteredRecordResults = recordResults.filter((record) =>
      record.nickname.toLowerCase().includes(recordSearch.trim().toLowerCase()),
    );
```

Replace the skeleton return body with:

```jsx
      <main className="records-page">
        <section className="records-header">
          <div>
            <p className="eyebrow">{recordsCollection?.title ?? '이미지 월드컵'}</p>
            <h1>선택 기록</h1>
            <p>사람별 플레이 기록을 선택해 겹치는 이미지와 각자만 고른 이미지를 비교합니다.</p>
          </div>
          <button type="button" className="secondary-button" onClick={closeRecordsView}>
            메인으로
          </button>
        </section>

        {recordsError && <p className="error-message">{recordsError}</p>}
        {recordsLoading && <p className="records-status">선택 기록을 불러오는 중입니다.</p>}

        {!recordsLoading && !recordsError && (
          <section className="records-layout">
            <aside className="records-sidebar" aria-label="선택 기록 목록">
              <label className="records-search">
                이름 검색
                <input
                  value={recordSearch}
                  onChange={(event) => setRecordSearch(event.target.value)}
                  placeholder="닉네임"
                />
              </label>
              {filteredRecordResults.length === 0 ? (
                <p className="records-status">표시할 선택 기록이 없습니다.</p>
              ) : (
                <div className="record-list">
                  {filteredRecordResults.map((record) => (
                    <label className="record-row" key={record.id}>
                      <input
                        type="checkbox"
                        checked={selectedRecordIds.has(record.id)}
                        onChange={() => toggleRecord(record.id)}
                      />
                      <span>
                        <strong>{record.nickname}</strong>
                        <small>{formatRecordDate(record.createdAt)} · {record.selectedImageCount}장</small>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </aside>
            <section className="records-comparison" aria-label="선택 기록 비교">
              <h2>{selectedRecordIds.size}개 기록 비교</h2>
            </section>
          </section>
        )}
      </main>
```

Add helper below `pushPath`:

```js
function formatRecordDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || '날짜 없음';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
```

- [ ] **Step 5: Add records list CSS**

Add:

```css
.records-layout {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  gap: 18px;
  margin-top: 22px;
}

.records-sidebar,
.records-comparison {
  min-width: 0;
  display: grid;
  gap: 12px;
  align-content: start;
}

.records-search {
  display: grid;
  gap: 8px;
  font-weight: 800;
}

.records-search input {
  width: 100%;
  min-height: 44px;
  border: 1px solid #c8d0d7;
  border-radius: 8px;
  padding: 0 12px;
}

.record-list {
  display: grid;
  gap: 8px;
}

.record-row {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid #d8dee3;
  border-radius: 8px;
  background: #ffffff;
}

.record-row span {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.record-row strong,
.record-row small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-row small {
  color: #65717b;
  font-weight: 800;
}

.records-status {
  margin: 18px 0 0;
  color: #65717b;
  font-weight: 800;
}
```

- [ ] **Step 6: Run UI tests to verify pass**

Run:

```bash
pnpm test src/App.test.jsx
```

Expected: PASS.

- [ ] **Step 7: Commit records list**

```bash
git add src/App.jsx src/App.test.jsx src/styles.css
git commit -m "feat: load selection records page"
```

---

### Task 5: Comparison Rendering and Star Filter

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add failing tests for comparison groups and filter changes**

Add:

```js
  test('compares selected records and recomputes when star filter changes', async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: '스냅 월드컵 선택 기록 보기' }));

    expect(await screen.findByRole('heading', { name: '모두 겹친 이미지' })).toBeInTheDocument();
    expect(screen.getByText('a.jpg')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '각 기록에만 있는 이미지' })).toBeInTheDocument();
    expect(screen.getByText('d.jpg')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('별점 필터'), '최고 별점만');

    expect(screen.queryByText('d.jpg')).not.toBeInTheDocument();
    expect(screen.getByText('최고 별점만')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run UI tests to verify failure**

Run:

```bash
pnpm test src/App.test.jsx
```

Expected: FAIL because comparison sections and filter do not exist.

- [ ] **Step 3: Import comparison helpers and add filter state**

In `src/App.jsx`, add:

```js
import { compareSelectedRecords, starFilterOptions } from './game/records.js';
```

Add state:

```js
  const [starFilter, setStarFilter] = useState(starFilterOptions[0].id);
```

Inside the records view branch, derive:

```js
    const imageById = new Map(recordImages.map((image) => [image.id, image]));
    const selectedRecords = recordResults.filter((record) => selectedRecordIds.has(record.id));
    const comparison = compareSelectedRecords(selectedRecords, starFilter);
```

Add helper inside `App`:

```js
  function getRecordLabel(recordId) {
    const record = recordResults.find((item) => item.id === recordId);

    return record ? `${record.nickname} · ${formatRecordDate(record.createdAt)}` : recordId;
  }
```

- [ ] **Step 4: Render comparison sections**

Replace the `.records-comparison` section with:

```jsx
            <section className="records-comparison" aria-label="선택 기록 비교">
              <div className="comparison-toolbar">
                <h2>{selectedRecordIds.size}개 기록 비교</h2>
                <label>
                  별점 필터
                  <select value={starFilter} onChange={(event) => setStarFilter(event.target.value)}>
                    {starFilterOptions.map((option) => (
                      <option value={option.id} key={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {selectedRecords.length === 0 && <p className="records-status">왼쪽 목록에서 선택 기록을 골라주세요.</p>}
              {selectedRecords.length === 1 && (
                <RecordImageSection
                  title={`${selectedRecords[0].nickname}의 선택 이미지`}
                  imageIds={comparison.singleRecordImageIds}
                  imageById={imageById}
                  onExpand={setExpandedImage}
                />
              )}
              {selectedRecords.length >= 2 && (
                <>
                  <RecordImageSection
                    title="모두 겹친 이미지"
                    imageIds={comparison.commonImageIds}
                    imageById={imageById}
                    onExpand={setExpandedImage}
                  />
                  <RecordImageSection
                    title="일부만 겹친 이미지"
                    imageIds={comparison.partialImageIds}
                    imageById={imageById}
                    onExpand={setExpandedImage}
                  />
                  <section className="comparison-section">
                    <h3>각 기록에만 있는 이미지</h3>
                    {comparison.uniqueByRecord.map((group) => (
                      <RecordImageSection
                        title={getRecordLabel(group.recordId)}
                        imageIds={group.imageIds}
                        imageById={imageById}
                        onExpand={setExpandedImage}
                        key={group.recordId}
                      />
                    ))}
                  </section>
                </>
              )}
            </section>
```

Add component after `App`:

```jsx
function RecordImageSection({ title, imageIds, imageById, onExpand }) {
  return (
    <section className="comparison-section">
      <div className="comparison-section-title">
        <h3>{title}</h3>
        <span>{imageIds.length}장</span>
      </div>
      {imageIds.length === 0 ? (
        <p className="records-status">현재 필터에서 표시할 이미지가 없습니다.</p>
      ) : (
        <div className="image-grid compact records-image-grid">
          {imageIds.map((imageId) => {
            const image = imageById.get(imageId) ?? {
              id: imageId,
              filename: imageId,
              previewUrl: '',
              originalUrl: '',
            };

            return (
              <figure className="result-card records-result-card" key={imageId}>
                {image.previewUrl ? (
                  <button
                    type="button"
                    className="result-image-button"
                    aria-label={`${image.filename} 확대 보기`}
                    onClick={() => onExpand(image)}
                  >
                    <img src={image.previewUrl} alt="" loading="lazy" />
                  </button>
                ) : (
                  <div className="missing-image-card">{image.filename}</div>
                )}
                <figcaption>{image.filename}</figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </section>
  );
}
```

Reuse the existing `expandedImage` modal by moving the modal JSX into a helper component or duplicating the same modal block in the records branch. Prefer a helper component:

```jsx
function ImageModal({ image, onClose }) {
  if (!image) {
    return null;
  }

  return (
    <div className="image-modal" role="dialog" aria-modal="true" aria-label={image.filename} onClick={onClose}>
      <div className="image-modal-panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close-button" onClick={onClose}>
          닫기
        </button>
        <img src={image.originalUrl} alt={`${image.filename} 원본`} />
      </div>
    </div>
  );
}
```

Then replace the existing result modal block and add `<ImageModal image={expandedImage} onClose={() => setExpandedImage(null)} />` in both finished results and records view branches.

- [ ] **Step 5: Add comparison CSS**

Add:

```css
.comparison-toolbar,
.comparison-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.comparison-toolbar h2,
.comparison-section h3 {
  margin: 0;
  color: #151719;
  letter-spacing: 0;
}

.comparison-toolbar label {
  display: grid;
  gap: 6px;
  color: #4d5963;
  font-weight: 800;
}

.comparison-toolbar select {
  min-height: 42px;
  border: 1px solid #c8d0d7;
  border-radius: 8px;
  padding: 0 10px;
  background: #ffffff;
}

.comparison-section {
  min-width: 0;
  display: grid;
  gap: 10px;
}

.comparison-section-title span {
  color: #65717b;
  font-weight: 900;
  white-space: nowrap;
}

.records-image-grid {
  margin-top: 0;
}

.records-result-card figcaption,
.missing-image-card {
  overflow: hidden;
  color: #5d666f;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.missing-image-card {
  min-height: 130px;
  display: grid;
  place-items: center;
  padding: 10px;
  border-radius: 6px;
  background: #edf1f3;
}
```

- [ ] **Step 6: Run focused tests to verify pass**

Run:

```bash
pnpm test src/game/records.test.js src/App.test.jsx
```

Expected: PASS.

- [ ] **Step 7: Commit comparison UI**

```bash
git add src/App.jsx src/App.test.jsx src/styles.css
git commit -m "feat: compare selection record images"
```

---

### Task 6: Mobile Layout and Visual Verification

**Files:**
- Modify: `src/styles.css`
- Test: manual/browser verification

- [ ] **Step 1: Add mobile CSS**

Append:

```css
@media (max-width: 720px) {
  .records-page {
    padding: 14px;
  }

  .records-header {
    display: grid;
  }

  .records-header .secondary-button {
    width: 100%;
  }

  .records-layout {
    grid-template-columns: 1fr;
  }

  .comparison-toolbar {
    display: grid;
    align-items: stretch;
  }

  .comparison-toolbar label,
  .comparison-toolbar select {
    width: 100%;
  }

  .collection-card-actions {
    grid-template-columns: 1fr;
  }

  .record-row {
    align-items: start;
  }

  .record-row strong,
  .record-row small {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .comparison-section-title {
    align-items: start;
  }
}

@media (max-width: 420px) {
  .records-page {
    padding: 10px;
  }

  .records-header h1 {
    font-size: 30px;
  }

  .image-grid.compact.records-image-grid {
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    gap: 10px;
  }
}
```

- [ ] **Step 2: Run full automated test suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
pnpm build
```

Expected: PASS with Vite build output and no layout-related compile errors.

- [ ] **Step 4: Start dev server**

Run:

```bash
pnpm dev
```

Expected: server starts Express and Vite. Keep the session running until visual verification is complete.

- [ ] **Step 5: Verify desktop layout**

Open:

```text
http://localhost:5173
```

Check:

- Each collection card shows cover image, title, image count, `시작`, and `선택 기록 보기`.
- Buttons do not overlay or cover card text/image.
- `선택 기록 보기` opens `/collections/<collectionId>/records`.
- Records page shows left record list and right comparison area.
- Selecting/unselecting records updates comparison groups.
- Star filter updates comparison groups.

- [ ] **Step 6: Verify mobile layout at 390px width**

Use Browser/Playwright or Chrome device emulation at 390px wide. Check:

- Main collection card actions fit without clipping.
- `선택 기록 보기` text does not cover image or title.
- Records page stacks list above comparison output.
- Record rows with long nicknames wrap or truncate cleanly and do not cover checkboxes.
- Search input and star filter fit the viewport.
- Comparison headings and count labels do not overlap.
- Image grid cards fit and filenames do not push adjacent cards out of alignment.

- [ ] **Step 7: Fix any mobile issues and repeat verification**

If text wraps awkwardly, adjust the relevant CSS with one of these concrete patterns:

```css
white-space: normal;
overflow-wrap: anywhere;
```

or:

```css
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
```

Pick wrapping for readable labels and ellipsis for dense metadata. Re-run `pnpm test`, `pnpm build`, and mobile verification after changes.

- [ ] **Step 8: Commit responsive polish**

```bash
git add src/styles.css
git commit -m "style: polish selection records mobile layout"
```

---

## Final Verification

- [ ] Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] Confirm mobile visual verification was completed at about 390px width and record the outcome in the final response.

- [ ] Check git status:

```bash
git status --short
```

Expected: clean or only intentional uncommitted changes requested by the user.

---

## Self-Review Notes

- Spec coverage: API filtering/sorting/exclusion, record list, latest-three default selection, star filters, overlap groups, missing images, modal, mobile layout verification, and tests are covered by Tasks 1-6.
- Scope control: deleting/editing records, popularity ranking, nickname merging, and intermediate download-record comparison remain out of scope.
- Type consistency: server response uses `results`, `selectedImageCount`, `createdAt`; client comparison helpers consume the same `results` shape and record `id`.
