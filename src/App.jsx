import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createGameState,
  excludeSelectedImages,
  finishBatch,
  getCurrentBatch,
  groupByStars,
  mergeUniqueImages,
} from './game/engine.js';
import { compareSelectedRecords, getFilteredRecordImageIds, starFilterOptions } from './game/records.js';

function getRecordsRouteCollectionId() {
  const match = window.location.pathname.match(/^\/collections\/([^/]+)\/records$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function pushPath(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event('popstate'));
}

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

function getRecordTypeLabel(record) {
  if (record.type !== 'round-selection-download') {
    return '';
  }

  const round = Number(record.round);
  return Number.isFinite(round) ? `Round ${round} 다운로드` : '선택 다운로드';
}

function formatRecordSummary(record, filterId = starFilterOptions[0].id) {
  const filteredImageCount = getFilteredRecordImageIds(record, filterId).length;
  const totalImageCount = record.selectedImageCount ?? filteredImageCount;
  const countLabel = filterId !== starFilterOptions[0].id
    ? `${filteredImageCount}장 · 전체 ${totalImageCount}장`
    : `${totalImageCount}장`;
  const summaryParts = [
    getRecordTypeLabel(record),
    formatRecordDate(record.createdAt),
    countLabel,
  ].filter(Boolean);

  return summaryParts.join(' · ');
}

function getRoundKey(round) {
  return String(round);
}

function getExtraRoundKey(round, iteration) {
  return `${round}-${iteration}`;
}

function getDownloadRoundKey(roundIntro) {
  return roundIntro.extraSelectionCount > 0
    ? getExtraRoundKey(roundIntro.completedRound, roundIntro.extraSelectionCount)
    : getRoundKey(roundIntro.completedRound);
}

export default function App() {
  const [nickname, setNickname] = useState('');
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [images, setImages] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [playRecordId, setPlayRecordId] = useState(null);
  const [roundIntro, setRoundIntro] = useState(null);
  const [history, setHistory] = useState([]);
  const [bonusHistory, setBonusHistory] = useState([]);
  const [bonusSelection, setBonusSelection] = useState(null);
  const [roundSelections, setRoundSelections] = useState([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const [recordsViewCollectionId, setRecordsViewCollectionId] = useState(() => getRecordsRouteCollectionId());
  const [recordImages, setRecordImages] = useState([]);
  const [recordResults, setRecordResults] = useState([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState(new Set());
  const [recordSearch, setRecordSearch] = useState('');
  const [starFilter, setStarFilter] = useState(starFilterOptions[0].id);
  const [recordsError, setRecordsError] = useState('');
  const [recordsLoading, setRecordsLoading] = useState(false);
  const savedOnce = useRef(false);

  useEffect(() => {
    fetch('/api/collections')
      .then((response) => {
        if (!response.ok) {
          throw new Error('월드컵 목록을 불러오지 못했습니다.');
        }

        return response.json();
      })
      .then((data) => {
        setCollections(data.collections ?? []);
        setSelectedCollection((current) => current ?? data.collections?.[0] ?? null);
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  useEffect(() => {
    function syncRoute() {
      setRecordsViewCollectionId(getRecordsRouteCollectionId());
    }

    window.addEventListener('popstate', syncRoute);

    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

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

  const activeGameState = bonusSelection?.gameState ?? gameState;
  const currentBatch = activeGameState ? getCurrentBatch(activeGameState) : [];
  const groupedResults = useMemo(() => {
    if (!gameState?.finished) {
      return {};
    }

    return groupByStars(gameState.scores, images);
  }, [gameState, images]);

  const resultPayload = useMemo(() => {
    if (!gameState?.finished) {
      return null;
    }

    return Object.fromEntries(
      Object.entries(groupedResults).map(([stars, groupImages]) => [
        stars,
        groupImages.map((image) => image.id),
      ]),
    );
  }, [gameState, groupedResults]);

  useEffect(() => {
    if (!gameState?.finished || !resultPayload || !playRecordId || savedOnce.current) {
      return;
    }

    savedOnce.current = true;
    fetch(`/api/play-records/${playRecordId}/complete`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roundSelections,
        results: resultPayload,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('결과 저장에 실패했습니다.');
        }

        return response.json();
      })
      .then((result) => setPlayRecordId(result.id))
      .catch((saveError) => setError(saveError.message));
  }, [gameState, playRecordId, resultPayload, roundSelections]);

  async function startGame(event, collectionOverride = selectedCollection) {
    event?.preventDefault();
    const trimmedName = nickname.trim();

    if (!collectionOverride) {
      setError('월드컵을 선택해주세요.');
      return;
    }

    if (!trimmedName) {
      setError('이름을 입력해주세요.');
      return;
    }

    setError('');
    setIsLoading(true);
    savedOnce.current = false;
    setPlayRecordId(null);

    try {
      const response = await fetch(`/api/collections/${collectionOverride.id}/images`);

      if (!response.ok) {
        throw new Error('이미지 목록을 불러오지 못했습니다.');
      }

      const data = await response.json();

      if (!data.images?.length) {
        throw new Error('표시할 이미지가 없습니다.');
      }

      const recordResponse = await fetch('/api/play-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionId: collectionOverride.id,
          collectionName: collectionOverride.name,
          nickname: trimmedName,
        }),
      });

      if (!recordResponse.ok) {
        throw new Error('플레이 기록을 만들지 못했습니다.');
      }

      const record = await recordResponse.json();

      setSelectedCollection(collectionOverride);
      setImages(data.images);
      setGameState(createGameState(data.images));
      setPlayRecordId(record.id);
      setSelectedIds(new Set());
      setRoundIntro(null);
      setHistory([]);
      setBonusHistory([]);
      setBonusSelection(null);
      setRoundSelections([]);
      setShowExitConfirm(false);
      setExpandedImage(null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  function toggleImage(id) {
    setSelectedIds((previous) => {
      const next = new Set(previous);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

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

  function moveNext() {
    if (bonusSelection) {
      moveNextBonusSelection();
      return;
    }

    if (!gameState) {
      return;
    }

    setError('');
    setHistory((previous) => [
      ...previous,
      {
        gameState,
        selectedIds: new Set(selectedIds),
        roundSelections,
      },
    ]);
    const nextState = finishBatch(gameState, [...selectedIds]);
    const completedRoundSelection =
      nextState.finished || nextState.round > gameState.round
        ? {
            round: getRoundKey(gameState.round),
            imageIds: nextState.round > gameState.round
              ? nextState.currentCandidates.map((image) => image.id)
              : nextState.nextCandidates.map((image) => image.id),
          }
        : null;
    const nextRoundSelections = completedRoundSelection ? [...roundSelections, completedRoundSelection] : roundSelections;

    if (completedRoundSelection) {
      setRoundSelections(nextRoundSelections);
    }

    setGameState(nextState);
    setRoundIntro(
      !nextState.finished && nextState.round > gameState.round
        ? {
            completedRound: gameState.round,
            nextRound: nextState.round,
            selectedImages: nextState.currentCandidates,
            baseCandidates: gameState.currentCandidates,
            extraSelectionCount: 0,
            roundSelections: nextRoundSelections,
          }
        : null,
    );
    setSelectedIds(new Set());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function moveNextBonusSelection() {
    if (!bonusSelection || !gameState || !roundIntro) {
      return;
    }

    setError('');
    setBonusHistory((previous) => [
      ...previous,
      {
        gameState: bonusSelection.gameState,
        selectedIds: new Set(selectedIds),
      },
    ]);

    const nextBonusState = finishBatch(bonusSelection.gameState, [...selectedIds]);
    const completedBonusSelection =
      nextBonusState.finished || nextBonusState.round > bonusSelection.gameState.round
        ? nextBonusState.round > bonusSelection.gameState.round
          ? nextBonusState.currentCandidates
          : nextBonusState.nextCandidates
        : null;

    if (!completedBonusSelection) {
      setBonusSelection({
        ...bonusSelection,
        gameState: nextBonusState,
      });
      setSelectedIds(new Set());
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const selectedImages = mergeUniqueImages(roundIntro.selectedImages, completedBonusSelection);
    const additionalIds = new Set(completedBonusSelection.map((image) => image.id));
    const scores = { ...gameState.scores };

    for (const imageId of additionalIds) {
      scores[imageId] = (scores[imageId] ?? 0) + 1;
    }

    const extraRoundSelection = {
      round: getExtraRoundKey(roundIntro.completedRound, bonusSelection.iteration),
      imageIds: completedBonusSelection.map((image) => image.id),
    };
    const nextRoundSelections = [...roundSelections, extraRoundSelection];
    const nextRoundIntro = {
      ...roundIntro,
      selectedImages,
      extraSelectionCount: bonusSelection.iteration,
      roundSelections: nextRoundSelections,
    };

    setGameState({
      ...gameState,
      currentCandidates: selectedImages,
      scores,
    });
    setRoundSelections(nextRoundSelections);
    setRoundIntro(nextRoundIntro);
    setBonusSelection(null);
    setBonusHistory([]);
    setSelectedIds(new Set());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startAdditionalSelection() {
    if (!roundIntro) {
      return;
    }

    const remainingImages = excludeSelectedImages(roundIntro.baseCandidates, roundIntro.selectedImages);

    if (remainingImages.length === 0) {
      return;
    }

    setBonusSelection({
      gameState: createGameState(remainingImages),
      completedRound: roundIntro.completedRound,
      iteration: roundIntro.extraSelectionCount + 1,
    });
    setBonusHistory([]);
    setSelectedIds(new Set());
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function movePrevious() {
    if (bonusSelection) {
      setBonusHistory((previous) => {
        if (previous.length === 0) {
          return previous;
        }

        const nextHistory = previous.slice(0, -1);
        const restored = previous.at(-1);
        setBonusSelection({
          ...bonusSelection,
          gameState: restored.gameState,
        });
        setSelectedIds(new Set(restored.selectedIds));
        setError('');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        return nextHistory;
      });
      return;
    }

    setHistory((previous) => {
      if (previous.length === 0) {
        return previous;
      }

      const nextHistory = previous.slice(0, -1);
      const restored = previous.at(-1);
      setGameState(restored.gameState);
      setSelectedIds(new Set(restored.selectedIds));
      setRoundSelections(restored.roundSelections);
      setRoundIntro(null);
      setError('');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      return nextHistory;
    });
  }

  function resetGame() {
    setGameState(null);
    setSelectedIds(new Set());
    setPlayRecordId(null);
    setRoundIntro(null);
    setHistory([]);
    setBonusHistory([]);
    setBonusSelection(null);
    setRoundSelections([]);
    setShowExitConfirm(false);
    setExpandedImage(null);
    savedOnce.current = false;
    setError('');
  }

  function openRecordsView(collection) {
    pushPath(`/collections/${encodeURIComponent(collection.id)}/records`);
  }

  function closeRecordsView() {
    pushPath('/');
  }

  function getRecordLabel(recordId) {
    const record = recordResults.find((item) => item.id === recordId);

    return record ? `${record.nickname} · ${formatRecordSummary(record, starFilter)}` : recordId;
  }

  function downloadZip(label, imageIds, filename, metadata = {}) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/api/downloads/group';
    form.style.display = 'none';

    const labelInput = document.createElement('input');
    labelInput.name = 'label';
    labelInput.value = label;
    form.append(labelInput);

    const imageIdsInput = document.createElement('input');
    imageIdsInput.name = 'imageIds';
    imageIdsInput.value = JSON.stringify(imageIds);
    form.append(imageIdsInput);

    const filenameInput = document.createElement('input');
    filenameInput.name = 'filename';
    filenameInput.value = filename;
    form.append(filenameInput);

    for (const [name, value] of Object.entries(metadata)) {
      const input = document.createElement('input');
      input.name = name;
      input.value = String(value);
      form.append(input);
    }

    document.body.append(form);
    form.submit();
    form.remove();
  }

  function downloadGroup(stars, groupImages) {
    downloadZip(
      `${stars}-stars`,
      groupImages.map((image) => image.id),
      `${stars}-stars.zip`,
      {
        collectionId: selectedCollection?.id ?? '',
      },
    );
  }

  function downloadRoundSelection() {
    if (!roundIntro?.selectedImages?.length) {
      return;
    }

    const roundKey = getDownloadRoundKey(roundIntro);

    downloadZip(
      `round-${roundKey}-selected`,
      roundIntro.selectedImages.map((image) => image.id),
      `round-${roundKey}-selected.zip`,
      {
        downloadKind: 'round-selection',
        playRecordId: playRecordId ?? '',
        collectionId: selectedCollection?.id ?? '',
        collectionName: selectedCollection?.name ?? '',
        nickname: nickname.trim(),
        round: roundKey,
        roundSelections: JSON.stringify(roundIntro.roundSelections ?? []),
      },
    );
  }

  if (recordsViewCollectionId) {
    const recordsCollection = collections.find((collection) => collection.id === recordsViewCollectionId);
    const filteredRecordResults = recordResults.filter((record) =>
      record.nickname.toLowerCase().includes(recordSearch.trim().toLowerCase()),
    );
    const imageById = new Map(recordImages.map((image) => [image.id, image]));
    const selectedRecords = recordResults.filter((record) => selectedRecordIds.has(record.id));
    const comparison = compareSelectedRecords(selectedRecords, starFilter);

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

        {recordsError && <p className="error-message">{recordsError}</p>}
        {recordsLoading && <p className="records-status">선택 기록을 불러오는 중입니다.</p>}

        <section className="records-layout">
          <aside className="records-sidebar">
            <label className="records-search">
              <span>이름 검색</span>
              <input
                type="search"
                value={recordSearch}
                onChange={(event) => setRecordSearch(event.target.value)}
                aria-label="이름 검색"
                placeholder="이름으로 찾기"
              />
            </label>
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
                    <small>{formatRecordSummary(record, starFilter)}</small>
                  </span>
                </label>
              ))}
            </div>
          </aside>

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
        </section>
        <ImageModal image={expandedImage} onClose={() => setExpandedImage(null)} />
      </main>
    );
  }

  if (gameState?.finished) {
    return (
      <main className="app-shell">
        <section className="result-header">
          <div>
            <p className="eyebrow">결과</p>
            <h1>{selectedCollection?.title ?? '웨딩사진 월드컵'} 결과</h1>
            <p>{nickname.trim()}의 결과</p>
            <p>{playRecordId ? `저장됨: ${playRecordId}` : '결과 저장 중'}</p>
          </div>
          <button type="button" className="secondary-button" onClick={resetGame}>
            다시 시작
          </button>
        </section>

        {error && <p className="error-message">{error}</p>}

        <section className="result-list">
          {Object.entries(groupedResults)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([stars, groupImages]) => (
              <article className="result-group" key={stars}>
                <div className="group-title">
                  <h2>별 {stars}개</h2>
                  <button type="button" className="secondary-button" onClick={() => downloadGroup(stars, groupImages)}>
                    그룹 다운로드
                  </button>
                </div>
                <div className="image-grid compact">
                  {groupImages.map((image) => (
                    <figure className="result-card" key={image.id}>
                      <button
                        type="button"
                        className="result-image-button"
                        aria-label={`${image.filename} 확대 보기`}
                        onClick={() => setExpandedImage(image)}
                      >
                        <img src={image.previewUrl} alt="" loading="lazy" />
                      </button>
                    </figure>
                  ))}
                </div>
              </article>
            ))}
        </section>

        <ImageModal image={expandedImage} onClose={() => setExpandedImage(null)} />
      </main>
    );
  }

  if (gameState && roundIntro && !bonusSelection) {
    const remainingAdditionalImages = excludeSelectedImages(roundIntro.baseCandidates, roundIntro.selectedImages);

    return (
      <main className="round-intro-screen">
        <section className="round-intro-panel">
          <p className="eyebrow">다음 라운드</p>
          <h1>Round {roundIntro.nextRound} 시작</h1>
          <p>
            Round {roundIntro.completedRound}에서 {roundIntro.extraSelectionCount > 0 ? '현재까지 고른' : '고른'}{' '}
            {roundIntro.selectedImages.length}장의 사진이 다음 별을 기다리고 있어요.
          </p>
          <div className="round-selection-count" aria-label={`이번 라운드 선택 이미지 ${roundIntro.selectedImages.length}개`}>
            <strong>{roundIntro.selectedImages.length}</strong>
            <span>개 선택됨</span>
          </div>
          {error && <p className="error-message">{error}</p>}
          <div className="round-intro-actions">
            <button type="button" className="primary-button round-intro-primary" onClick={() => setRoundIntro(null)}>
              다음 라운드 진행
            </button>
            <div className="round-intro-secondary-actions">
              <button type="button" className="secondary-button" onClick={downloadRoundSelection}>
                이번 선택 다운로드
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={startAdditionalSelection}
                disabled={remainingAdditionalImages.length === 0}
              >
                추가 이미지 셀렉
              </button>
            </div>
            <button type="button" className="exit-link-button" onClick={() => setShowExitConfirm(true)}>
              종료
            </button>
          </div>
        </section>
        {showExitConfirm && (
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-label="월드컵 종료 확인">
            <section className="confirm-panel">
              <h2>월드컵을 종료할까요?</h2>
              <p>지금까지의 진행 상태는 저장되지 않고 메인 페이지로 돌아갑니다.</p>
              <div className="confirm-actions">
                <button type="button" className="secondary-button" onClick={() => setShowExitConfirm(false)}>
                  아니오
                </button>
                <button type="button" className="primary-button" onClick={resetGame}>
                  예
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    );
  }

  if (activeGameState) {
    return (
      <main className="app-shell">
        <section className="play-header">
          <div>
            <p className="eyebrow">
              {bonusSelection ? `Round ${bonusSelection.completedRound}-${bonusSelection.iteration} 추가 셀렉` : `Round ${gameState.round}`}
            </p>
            <p>
              {activeGameState.cursor + 1}-{Math.min(activeGameState.cursor + activeGameState.itemsPerBatch, activeGameState.currentCandidates.length)} /{' '}
              {activeGameState.currentCandidates.length}
            </p>
          </div>
        </section>

        {error && <p className="error-message">{error}</p>}

        <section className={`image-grid play-grid count-${currentBatch.length}`}>
          {currentBatch.map((image) => {
            const selected = selectedIds.has(image.id);

            return (
              <button
                type="button"
                className={`image-choice ${selected ? 'selected' : ''}`}
                key={image.id}
                aria-pressed={selected}
                aria-label={image.filename}
                onClick={() => toggleImage(image.id)}
              >
                <img src={image.previewUrl} alt={image.filename} loading="lazy" />
              </button>
            );
          })}
        </section>

        <footer className="action-bar">
          <span>{selectedIds.size}개 선택됨</span>
          <button
            type="button"
            className="secondary-button"
            onClick={movePrevious}
            disabled={bonusSelection ? bonusHistory.length === 0 : history.length === 0}
          >
            이전
          </button>
          <button type="button" className="primary-button" onClick={moveNext}>
            다음
          </button>
        </footer>
      </main>
    );
  }

  return (
    <main className="start-screen">
      <form className="start-panel" onSubmit={startGame}>
        <p className="eyebrow">이미지 월드컵</p>
        <h1>{selectedCollection?.title ?? '웨딩사진 월드컵'}</h1>
        <section className="collection-picker" aria-label="월드컵 선택">
          {collections.map((collection) => (
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
                  className="secondary-button records-action-button"
                  onClick={() => openRecordsView(collection)}
                  disabled={isLoading}
                  aria-label={`${collection.title} 선택 기록 보기`}
                >
                  선택 기록 보기
                </button>
              </div>
            </article>
          ))}
        </section>
        <label>
          이름
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="별명"
            disabled={isLoading}
          />
        </label>
        {error && <p className="error-message">{error}</p>}
        <button type="submit" className="primary-button" disabled={isLoading}>
          {isLoading ? '불러오는 중' : '시작'}
        </button>
      </form>
    </main>
  );
}

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
                  <div className="missing-image-card" aria-hidden="true">
                    이미지 없음
                  </div>
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
