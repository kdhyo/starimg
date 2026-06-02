# Selection Records Page Design

## Goal

Add a way to view saved image-worldcup selections by collection and compare multiple play records. Users should understand that this page shows past selection records, not a new game result or aggregate scoreboard.

## Entry Point

Each collection card on the main page will show two actions below the image and collection metadata:

- `시작`
- `선택 기록 보기`

The actions will live in a dedicated card footer, not as an image overlay. This avoids covering the collection cover image, title, or image count. The `선택 기록 보기` button opens the selected collection's record page.

## Page Structure

The selection records page uses a two-pane layout on desktop and a stacked layout on mobile.

Left pane:

- Shows saved play records for the selected collection.
- Sorts records by `createdAt` descending.
- Does not merge records by nickname. If the same nickname appears multiple times, each saved play record appears separately.
- Displays each row as `nickname · createdAt · selected image count`.
- Lets users select multiple records with checkboxes.
- Provides a nickname search input. The search filters visible records by nickname and does not change selected records that are temporarily hidden.

Right pane:

- Shows comparison output for the checked records.
- Shows the selected record count.
- Provides a star filter.
- Groups images into clear comparison sections.

## Terminology

Use `선택 기록` consistently for the feature and entry button.

Recommended page title:

- `선택 기록`

Recommended helper copy:

- `사람별 플레이 기록을 선택해 겹치는 이미지와 각자만 고른 이미지를 비교합니다.`

## Star Filters

The comparison first applies a star filter to each selected record, then computes overlaps.

Filter options:

- `전체 선택`: all images selected at least once in that record. This is the default.
- `최고 별점만`: only images in that record's highest available star group.
- `별 3개 이상`: images whose star value is 3 or higher.

If a filter produces no images for a selected record, the record stays selected and the page shows that it has no images under the current filter.

## Comparison Groups

For two or more selected records, the page shows:

- `모두 겹친 이미지`: images present in every selected record after filtering.
- `일부만 겹친 이미지`: images present in at least two but not all selected records.
- `각 기록에만 있는 이미지`: images present in exactly one selected record, grouped by record.

For one selected record, the page shows that record's filtered images without overlap labels.

For zero selected records, the page prompts the user to select records from the left pane.

## Data Model

Existing final result records are already saved in `data/results.json` with:

- `id`
- `collectionId`
- `collectionName`
- `nickname`
- `results`
- `roundSelections`
- `createdAt`

Download records use `type: "round-selection-download"` and should appear in the selection records page because they are also saved selections. The UI labels them as intermediate round downloads, such as `Round 3 다운로드`, so users can distinguish them from final result records.

The page should treat final result records and intermediate round download records as comparable selection records.

## API Design

Add a collection-scoped records endpoint:

`GET /api/collections/:collectionId/results`

Response shape:

```json
{
  "results": [
    {
      "id": "result-id",
      "collectionId": "collection-id",
      "collectionName": "스냅",
      "nickname": "하늘",
      "createdAt": "2026-06-02T10:30:00+09:00",
      "results": {
        "5": ["a.jpg"],
        "4": ["b.jpg", "c.jpg"]
      },
      "selectedImageCount": 3
    }
  ]
}
```

Server behavior:

- Reads from `data/results.json`.
- Includes final result records and `round-selection-download` records.
- Excludes records with unsupported `type` values.
- Filters by `collectionId`.
- Sorts by `createdAt` descending using `Date.parse`; records with invalid dates sort after valid dates.
- Normalizes malformed `results` values to empty groups rather than crashing.
- Normalizes `round-selection-download.imageIds` into a comparable `results` group so overlap comparison can reuse the same client logic.
- Computes `selectedImageCount` as the number of unique image IDs across the normalized `results` groups.

The client will also fetch:

`GET /api/collections/:collectionId/images`

The client maps image IDs from saved records to collection image objects so comparison sections can render `previewUrl` and `originalUrl`.

## Client Routing

Keep routing lightweight and aligned with the current single-component app. Introduce a URL-driven view for collection records, such as:

`/collections/:collectionId/records`

Because the Express server already falls back to the built frontend for non-API routes, this can be handled client-side without adding React Router unless the implementation naturally benefits from splitting routes.

## UI Behavior

Main page:

- Collection cards remain selectable for starting games.
- The `시작` action starts the game for that collection.
- The `선택 기록 보기` action navigates to that collection's records page.

Records page:

- Loads collection metadata, collection images, and collection results.
- Shows loading and empty states.
- Defaults to selecting up to the latest three records if final result records exist.
- Lets users manually check and uncheck records.
- Lets users filter visible records by nickname without losing current selections.
- Recomputes comparison groups immediately when selected records or the star filter changes.
- Opens image originals in the existing image modal pattern.
- On mobile, stacks the record list and comparison output vertically with stable spacing. Buttons, filters, record rows, section titles, and image labels must not overlap, clip, or wrap into cramped unreadable layouts.

## Error Handling

- If the collection does not exist, show a collection-not-found message with a return-to-main action.
- If records fail to load, show an error message and keep a return-to-main action visible.
- If an image ID in a saved record no longer exists in the collection directory, show a placeholder card with the filename so the record remains understandable.
- If there are no final result records, show an empty state explaining that records appear after someone completes the worldcup.

## Testing

Server tests:

- `GET /api/collections/:collectionId/results` returns final result records and round selection download records for that collection.
- Results are sorted newest first.
- Unsupported typed records are excluded.
- Malformed or empty result groups do not crash the endpoint.

Client tests:

- Main collection cards expose `선택 기록 보기` without covering the image or replacing the start flow.
- Clicking `선택 기록 보기` opens the record page for that collection.
- Records render newest first.
- Selecting multiple records shows all-overlap, partial-overlap, and unique-image groups.
- Changing the star filter recomputes comparison output.
- Mobile UI verification is required. Test or manually verify a narrow viewport, such as 390px wide, to confirm collection card actions, record rows, search/filter controls, comparison headings, and image grids do not break, overlap, clip text, or force awkward unreadable wrapping.
- If any mobile text wraps, it must do so intentionally with enough vertical space. Long nicknames, timestamps, and labels should truncate, wrap cleanly, or move to a secondary line without covering adjacent controls.

## Out Of Scope

- Persisting named comparison groups.
- Editing or deleting saved records.
- Aggregated popularity rankings across all users.
- Merging records by nickname.
