# Play Record Storage Design

## Goal

Change result persistence from separate records per round download/final result into one play record that is created when the game starts and updated under the same id through round downloads, extra selections, and final completion.

## Terminology

- Play record: one user's single play session for one collection.
- Round selection: images selected at a completed round boundary.
- Extra selection round: an additional selection pass from a completed round, stored with a string round key such as `2-1`, `2-2`, or `2-3`.

## API

Use play-record-oriented URI names so the record is not confused with final-only results.

- `POST /api/play-records`: create an in-progress play record at game start.
- `GET /api/play-records/:id`: fetch one play record.
- `PATCH /api/play-records/:id`: update an in-progress play record.
- `PATCH /api/play-records/:id/complete`: mark the play record completed and save final result groups.

The existing download endpoint stays:

- `POST /api/downloads/group`: downloads a zip. When `downloadKind` is `round-selection`, it also updates the submitted `playRecordId`.

Existing `/api/results` routes may remain as compatibility aliases, but the client should use `/api/play-records`.

## Status Model

Manage statuses through a single code-level enum-like object:

```js
export const PlayRecordStatus = Object.freeze({
  InProgress: 'in-progress',
  Completed: 'completed',
  Abandoned: 'abandoned',
});
```

Status meanings:

- `in-progress`: created when the game starts; round downloads update this record.
- `completed`: set only when the final results are saved through `/api/play-records/:id/complete`.
- `abandoned`: reserved for explicit or future cleanup of unfinished sessions.

## Stored Record Shape

```json
{
  "id": "uuid",
  "status": "in-progress",
  "collectionId": "collection-id",
  "collectionName": "collection name",
  "nickname": "name",
  "roundSelections": [
    { "round": "1", "imageIds": ["a.jpg"] },
    { "round": "2", "imageIds": ["b.jpg"] },
    { "round": "2-1", "imageIds": ["c.jpg"] },
    { "round": "2-2", "imageIds": ["d.jpg"] },
    { "round": "2-3", "imageIds": ["e.jpg"] }
  ],
  "results": {},
  "createdAt": "2026-06-03T12:00:00+09:00",
  "updatedAt": "2026-06-03T12:00:00+09:00",
  "completedAt": null
}
```

Completion updates the same record:

```json
{
  "status": "completed",
  "results": {
    "1": ["a.jpg"],
    "2": ["b.jpg"],
    "4": ["d.jpg"],
    "5": ["e.jpg"]
  },
  "completedAt": "2026-06-03T12:30:00+09:00",
  "updatedAt": "2026-06-03T12:30:00+09:00"
}
```

## Update Rules

- Game start creates exactly one `in-progress` play record and stores its id in client state.
- Round download requires `playRecordId` and `round`.
- Round values are normalized as strings so both normal rounds (`"1"`, `"2"`) and extra rounds (`"2-1"`) can be stored.
- Updating a round selection upserts by the same round key. Re-downloading the same round replaces that round's `imageIds`; it does not create a new record.
- Extra selection downloads append or replace keys such as `2-1`, `2-2`, and `2-3` in the same play record.
- Final completion updates the existing record with final `results`, latest `roundSelections`, `status: 'completed'`, `completedAt`, and `updatedAt`.

## Compatibility

- Existing final result records without `status` should continue to display as completed records.
- Existing `round-selection-download` records should continue to display in the records view.
- New client flows should not create new `round-selection-download` records.

## Testing

- Server tests should cover creating a play record, updating round selections by id, completing the same id, and preserving compatibility for old records.
- Client tests should cover game start creating a play record, round download submitting `playRecordId`, and final completion using `/api/play-records/:id/complete`.
