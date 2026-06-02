import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createGameState,
  excludeSelectedImages,
  finishBatch,
  getCurrentBatch,
  groupByStars,
  mergeUniqueImages,
} from './game/engine.js';

export default function App() {
  const [nickname, setNickname] = useState('');
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [images, setImages] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [savedResultId, setSavedResultId] = useState(null);
  const [roundIntro, setRoundIntro] = useState(null);
  const [history, setHistory] = useState([]);
  const [bonusHistory, setBonusHistory] = useState([]);
  const [bonusSelection, setBonusSelection] = useState(null);
  const [roundSelections, setRoundSelections] = useState([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
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
    if (!gameState?.finished || !resultPayload || savedOnce.current) {
      return;
    }

    savedOnce.current = true;
    fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectionId: selectedCollection?.id,
        collectionName: selectedCollection?.name,
        nickname,
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
      .then((result) => setSavedResultId(result.id))
      .catch((saveError) => setError(saveError.message));
  }, [gameState, nickname, resultPayload, roundSelections, selectedCollection]);

  async function startGame(event) {
    event.preventDefault();
    const trimmedName = nickname.trim();

    if (!selectedCollection) {
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
    setSavedResultId(null);

    try {
      const response = await fetch(`/api/collections/${selectedCollection.id}/images`);

      if (!response.ok) {
        throw new Error('이미지 목록을 불러오지 못했습니다.');
      }

      const data = await response.json();

      if (!data.images?.length) {
        throw new Error('표시할 이미지가 없습니다.');
      }

      setImages(data.images);
      setGameState(createGameState(data.images));
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
            round: gameState.round,
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
    const selectedImageIds = selectedImages.map((image) => image.id);
    const additionalIds = new Set(completedBonusSelection.map((image) => image.id));
    const scores = { ...gameState.scores };

    for (const imageId of additionalIds) {
      scores[imageId] = (scores[imageId] ?? 0) + 1;
    }

    const nextRoundSelections = roundSelections.map((selection) =>
      selection.round === roundIntro.completedRound
        ? {
            ...selection,
            imageIds: selectedImageIds,
          }
        : selection,
    );
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
    setSavedResultId(null);
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

    downloadZip(
      `round-${roundIntro.completedRound}-selected`,
      roundIntro.selectedImages.map((image) => image.id),
      `round-${roundIntro.completedRound}-selected.zip`,
      {
        downloadKind: 'round-selection',
        collectionId: selectedCollection?.id ?? '',
        collectionName: selectedCollection?.name ?? '',
        nickname: nickname.trim(),
        round: roundIntro.completedRound,
        roundSelections: JSON.stringify(roundIntro.roundSelections ?? []),
      },
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
            <p>{savedResultId ? `저장됨: ${savedResultId}` : '결과 저장 중'}</p>
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

        {expandedImage && (
          <div
            className="image-modal"
            role="dialog"
            aria-modal="true"
            aria-label={expandedImage.filename}
            onClick={() => setExpandedImage(null)}
          >
            <div className="image-modal-panel" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="modal-close-button" onClick={() => setExpandedImage(null)}>
                닫기
              </button>
              <img src={expandedImage.originalUrl} alt={`${expandedImage.filename} 원본`} />
            </div>
          </div>
        )}
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
            <button type="button" className="secondary-button" onClick={() => setShowExitConfirm(true)}>
              종료
            </button>
            <button type="button" className="primary-button" onClick={() => setRoundIntro(null)}>
              다음 라운드 진행
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
            <button
              type="button"
              className={`collection-card ${selectedCollection?.id === collection.id ? 'selected' : ''}`}
              key={collection.id}
              onClick={() => setSelectedCollection(collection)}
              disabled={isLoading}
            >
              <img src={collection.coverPreviewUrl} alt="" />
              <span>{collection.title}</span>
              <small>{collection.imageCount}장</small>
            </button>
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
