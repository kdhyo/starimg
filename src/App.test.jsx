import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App.jsx';

const images = [
  { id: 'a.jpg', filename: 'a.jpg', previewUrl: '/api/collections/snap/images/a.jpg/preview', originalUrl: '/api/collections/snap/images/a.jpg/original' },
  { id: 'b.jpg', filename: 'b.jpg', previewUrl: '/api/collections/snap/images/b.jpg/preview', originalUrl: '/api/collections/snap/images/b.jpg/original' },
  { id: 'c.jpg', filename: 'c.jpg', previewUrl: '/api/collections/snap/images/c.jpg/preview', originalUrl: '/api/collections/snap/images/c.jpg/original' },
  { id: 'd.jpg', filename: 'd.jpg', previewUrl: '/api/collections/snap/images/d.jpg/preview', originalUrl: '/api/collections/snap/images/d.jpg/original' },
  { id: 'e.jpg', filename: 'e.jpg', previewUrl: '/api/collections/snap/images/e.jpg/preview', originalUrl: '/api/collections/snap/images/e.jpg/original' },
  { id: 'f.jpg', filename: 'f.jpg', previewUrl: '/api/collections/snap/images/f.jpg/preview', originalUrl: '/api/collections/snap/images/f.jpg/original' },
  { id: 'g.jpg', filename: 'g.jpg', previewUrl: '/api/collections/snap/images/g.jpg/preview', originalUrl: '/api/collections/snap/images/g.jpg/original' },
  { id: 'h.jpg', filename: 'h.jpg', previewUrl: '/api/collections/snap/images/h.jpg/preview', originalUrl: '/api/collections/snap/images/h.jpg/original' },
  { id: 'i.jpg', filename: 'i.jpg', previewUrl: '/api/collections/snap/images/i.jpg/preview', originalUrl: '/api/collections/snap/images/i.jpg/original' },
  { id: 'j.jpg', filename: 'j.jpg', previewUrl: '/api/collections/snap/images/j.jpg/preview', originalUrl: '/api/collections/snap/images/j.jpg/original' },
];

const collections = [
  { id: 'snap', name: '스냅', title: '스냅 월드컵', imageCount: 10, coverPreviewUrl: images[0].previewUrl },
  { id: 'hair', name: '헤어변형쌤', title: '헤어변형쌤 월드컵', imageCount: 4, coverPreviewUrl: images[1].previewUrl },
];

const collectionResults = [
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
    id: 'result-new',
    collectionId: 'snap',
    collectionName: '스냅',
    nickname: '민지',
    createdAt: '2026-06-02T11:00:00+09:00',
    results: { 5: ['a.jpg'], 3: ['b.jpg'] },
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

let submittedForms;

beforeEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
  submittedForms = [];
  vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function submit() {
    submittedForms.push(this.cloneNode(true));
  });
  global.fetch = vi.fn(async (url, options) => {
    if (url === '/api/collections') {
      return Response.json({ collections });
    }
    if (url === '/api/collections/snap/images') {
      return Response.json({ images });
    }
    if (url === '/api/collections/snap/results') {
      return Response.json({ results: collectionResults });
    }
    if (url === '/api/results' && options?.method === 'POST') {
      return Response.json({ id: 'result-1' }, { status: 201 });
    }
    return Response.json({}, { status: 404 });
  });
});

describe('App', () => {
  test('locks start form controls while images are loading', async () => {
    let resolveImages;
    global.fetch = vi.fn((url) => {
      if (url === '/api/collections') {
        return Promise.resolve(Response.json({ collections }));
      }

      return new Promise((resolve) => {
        resolveImages = () => resolve(Response.json({ images }));
      });
    });
    render(<App />);

    await userEvent.type(screen.getByLabelText('이름'), '하늘');
    await userEvent.click(screen.getByRole('button', { name: '시작' }));

    expect(screen.getByLabelText('이름')).toBeDisabled();
    expect(screen.getByRole('button', { name: '불러오는 중' })).toBeDisabled();

    resolveImages();

    expect(await screen.findByText('1-9 / 10')).toBeInTheDocument();
  });

  test('starts directly with a fixed 3 by 3 image grid', async () => {
    render(<App />);

    expect(screen.queryByRole('button', { name: '5' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '10' })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('이름'), '하늘');
    await userEvent.click(screen.getByRole('button', { name: '시작' }));

    expect(await screen.findByText('1-9 / 10')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '마음에 드는 이미지를 선택하세요' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '처음으로' })).not.toBeInTheDocument();
    expect(document.querySelector('.play-grid')).toHaveClass('count-9');
  });

  test('does not start without a nickname', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: '스냅 월드컵' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '시작' }));

    expect(await screen.findByText('이름을 입력해주세요.')).toBeInTheDocument();
  });

  test('opens selection records from a collection card action', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: '스냅 월드컵' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '스냅 월드컵 선택 기록 보기' }));

    expect(await screen.findByRole('heading', { name: '선택 기록' })).toBeInTheDocument();
    expect(screen.getByText('사람별 플레이 기록을 선택해 겹치는 이미지와 각자만 고른 이미지를 비교합니다.')).toBeInTheDocument();
  });

  test('renders records in response order and selects latest three by default', async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: '스냅 월드컵 선택 기록 보기' }));

    const recordCheckboxes = await screen.findAllByRole('checkbox');

    expect(recordCheckboxes.map((checkbox) => checkbox.closest('label').textContent)).toEqual([
      expect.stringContaining('하늘'),
      expect.stringContaining('민지'),
      expect.stringContaining('사용자A'),
    ]);
    expect(screen.getByText('3개 기록 비교')).toBeInTheDocument();
    expect(screen.getByLabelText('이름 검색')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /민지/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /하늘/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /사용자A/ })).toBeChecked();
  });

  test('allows selecting and unselecting an image', async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText('이름'), '하늘');
    await userEvent.click(screen.getByRole('button', { name: '시작' }));
    const firstImage = await screen.findByRole('button', { name: /a.jpg/ });

    await userEvent.click(firstImage);
    expect(firstImage).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(firstImage);
    expect(firstImage).toHaveAttribute('aria-pressed', 'false');
  });

  test('scrolls to the top after moving to the next batch', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<App />);

    await userEvent.type(screen.getByLabelText('이름'), '하늘');
    await userEvent.click(screen.getByRole('button', { name: '시작' }));
    await screen.findByRole('button', { name: /a.jpg/ });
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });

    scrollTo.mockRestore();
  });

  test('returns to the previous selection batch from the bottom bar', async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText('이름'), '하늘');
    await userEvent.click(screen.getByRole('button', { name: '시작' }));
    const firstImage = await screen.findByRole('button', { name: /a.jpg/ });

    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();

    await userEvent.click(firstImage);
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(await screen.findByText('10-10 / 10')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '이전' }));

    expect(await screen.findByText('1-9 / 10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /a.jpg/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('allows moving to results without selecting an image', async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText('이름'), '하늘');
    await userEvent.click(screen.getByRole('button', { name: '시작' }));
    await screen.findByRole('button', { name: /a.jpg/ });
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(await screen.findByRole('heading', { name: '스냅 월드컵 결과' })).toBeInTheDocument();
    expect(screen.getByText('하늘의 결과')).toBeInTheDocument();
    expect(screen.queryByText('하나 이상 선택해주세요.')).not.toBeInTheDocument();
  });

  test('shows an interstitial when advancing to the next round', async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText('이름'), '하늘');
    await userEvent.click(screen.getByRole('button', { name: '시작' }));
    await userEvent.click(await screen.findByRole('button', { name: /a.jpg/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await userEvent.click(screen.getByRole('button', { name: /j.jpg/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(await screen.findByRole('heading', { name: 'Round 2 시작' })).toBeInTheDocument();
    expect(screen.getByText('Round 1에서 고른 2장의 사진이 다음 별을 기다리고 있어요.')).toBeInTheDocument();
    expect(screen.getByLabelText('이번 라운드 선택 이미지 2개')).toHaveTextContent('2개 선택됨');

    await userEvent.click(screen.getByRole('button', { name: '이번 선택 다운로드' }));

    expect(submittedForms).toHaveLength(1);
    expect(submittedForms[0]).toHaveAttribute('method', 'POST');
    expect(submittedForms[0]).toHaveAttribute('action', '/api/downloads/group');
    expect(submittedForms[0].querySelector('[name="label"]')).toHaveValue('round-1-selected');
    expect(submittedForms[0].querySelector('[name="imageIds"]')).toHaveValue(JSON.stringify(['a.jpg', 'j.jpg']));
    expect(submittedForms[0].querySelector('[name="downloadKind"]')).toHaveValue('round-selection');
    expect(submittedForms[0].querySelector('[name="collectionId"]')).toHaveValue('snap');
    expect(submittedForms[0].querySelector('[name="collectionName"]')).toHaveValue('스냅');
    expect(submittedForms[0].querySelector('[name="nickname"]')).toHaveValue('하늘');
    expect(submittedForms[0].querySelector('[name="round"]')).toHaveValue('1');
    expect(submittedForms[0].querySelector('[name="roundSelections"]')).toHaveValue(
      JSON.stringify([{ round: 1, imageIds: ['a.jpg', 'j.jpg'] }]),
    );

    await userEvent.click(screen.getByRole('button', { name: '다음 라운드 진행' }));

    expect(screen.getByText('1-2 / 2')).toBeInTheDocument();
  });

  test('allows repeated additional selection before advancing with accumulated images', async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText('이름'), '하늘');
    await userEvent.click(screen.getByRole('button', { name: '시작' }));
    await userEvent.click(await screen.findByRole('button', { name: /a.jpg/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await userEvent.click(screen.getByRole('button', { name: /j.jpg/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(await screen.findByRole('heading', { name: 'Round 2 시작' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '추가 이미지 셀렉' }));

    expect(await screen.findByText('Round 1-1 추가 셀렉')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /a.jpg/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /j.jpg/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /b.jpg/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(await screen.findByLabelText('이번 라운드 선택 이미지 3개')).toHaveTextContent('3개 선택됨');

    await userEvent.click(screen.getByRole('button', { name: '추가 이미지 셀렉' }));

    expect(await screen.findByText('Round 1-2 추가 셀렉')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /a.jpg/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /b.jpg/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /j.jpg/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /c.jpg/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(await screen.findByLabelText('이번 라운드 선택 이미지 4개')).toHaveTextContent('4개 선택됨');

    await userEvent.click(screen.getByRole('button', { name: '이번 선택 다운로드' }));

    expect(submittedForms[0].querySelector('[name="imageIds"]')).toHaveValue(JSON.stringify(['a.jpg', 'j.jpg', 'b.jpg', 'c.jpg']));
    expect(submittedForms[0].querySelector('[name="roundSelections"]')).toHaveValue(
      JSON.stringify([{ round: 1, imageIds: ['a.jpg', 'j.jpg', 'b.jpg', 'c.jpg'] }]),
    );

    await userEvent.click(screen.getByRole('button', { name: '다음 라운드 진행' }));

    expect(screen.getByText('1-4 / 4')).toBeInTheDocument();
  });

  test('confirms before exiting from the next round screen', async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText('이름'), '하늘');
    await userEvent.click(screen.getByRole('button', { name: '시작' }));
    await userEvent.click(await screen.findByRole('button', { name: /a.jpg/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await userEvent.click(screen.getByRole('button', { name: /j.jpg/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(await screen.findByRole('heading', { name: 'Round 2 시작' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '종료' }));

    expect(screen.getByRole('dialog', { name: '월드컵 종료 확인' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '아니오' }));

    expect(screen.queryByRole('dialog', { name: '월드컵 종료 확인' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Round 2 시작' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '종료' }));
    await userEvent.click(screen.getByRole('button', { name: '예' }));

    expect(await screen.findByRole('heading', { name: '스냅 월드컵' })).toBeInTheDocument();
  });

  test('shows results grouped by stars and stores them once', async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText('이름'), '하늘');
    await userEvent.click(screen.getByRole('button', { name: '시작' }));
    await userEvent.click(await screen.findByRole('button', { name: /a.jpg/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(await screen.findByRole('heading', { name: '스냅 월드컵 결과' })).toBeInTheDocument();
    expect(screen.getByText('하늘의 결과')).toBeInTheDocument();
    expect(screen.getByText('별 1개')).toBeInTheDocument();
    expect(screen.queryByText('원본')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'a.jpg 확대 보기' }));

    expect(screen.getByRole('dialog', { name: 'a.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'a.jpg 원본' })).toHaveAttribute('src', '/api/collections/snap/images/a.jpg/original');

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/results',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"roundSelections"'),
        }),
      );
    });
    expect(global.fetch.mock.calls.filter(([url]) => url === '/api/results')).toHaveLength(1);
  });
});
