import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const desktopImages = [
  ...images,
  { id: 'k.jpg', filename: 'k.jpg', previewUrl: '/api/collections/snap/images/k.jpg/preview', originalUrl: '/api/collections/snap/images/k.jpg/original' },
  { id: 'l.jpg', filename: 'l.jpg', previewUrl: '/api/collections/snap/images/l.jpg/preview', originalUrl: '/api/collections/snap/images/l.jpg/original' },
];

const collections = [
  { id: 'snap', name: '스냅', title: '스냅 월드컵', imageCount: 10, coverPreviewUrl: images[0].previewUrl },
  { id: 'hair', name: '헤어변형쌤', title: '헤어변형쌤 월드컵', imageCount: 4, coverPreviewUrl: images[1].previewUrl },
];

const collectionResults = [
  {
    id: 'download-middle',
    type: 'round-selection-download',
    collectionId: 'snap',
    collectionName: '스냅',
    nickname: '하늘',
    createdAt: '2026-06-02T10:00:00+09:00',
    round: 3,
    label: 'round-3-selected',
    results: { 1: ['a.jpg', 'c.jpg', 'b.jpg'] },
    selectedImageCount: 3,
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
    results: { 5: ['a.jpg'], 4: ['d.jpg', 'missing.jpg'] },
    selectedImageCount: 3,
  },
];

let submittedForms;

beforeEach(() => {
  vi.restoreAllMocks();
  window.matchMedia = undefined;
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
    if (url === '/api/play-records' && options?.method === 'POST') {
      return Response.json({ id: 'play-record-1' }, { status: 201 });
    }
    if (url === '/api/play-records/play-record-1/complete' && options?.method === 'PATCH') {
      return Response.json({ id: 'play-record-1', status: 'completed' });
    }
    return Response.json({}, { status: 404 });
  });
});

describe('App', () => {
  test('locks start form controls while images are loading', async () => {
    let resolveImages;
    global.fetch = vi.fn((url, options) => {
      if (url === '/api/collections') {
        return Promise.resolve(Response.json({ collections }));
      }
      if (url === '/api/play-records' && options?.method === 'POST') {
        return Promise.resolve(Response.json({ id: 'play-record-1' }, { status: 201 }));
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

  test('starts directly with the mobile 3 by 3 image grid', async () => {
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

  test('shows the selected image count in the play header', async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText('이름'), '하늘');
    await userEvent.click(screen.getByRole('button', { name: '시작' }));

    expect(await screen.findByLabelText('현재 라운드 선택 이미지 수')).toHaveTextContent('선택 0장');

    const firstImage = screen.getByRole('button', { name: /a.jpg/ });
    await userEvent.click(firstImage);

    expect(screen.getByLabelText('현재 라운드 선택 이미지 수')).toHaveTextContent('선택 1장');

    await userEvent.click(firstImage);

    expect(screen.getByLabelText('현재 라운드 선택 이미지 수')).toHaveTextContent('선택 0장');
  });

  test('uses a 5 by 2 image grid on desktop screens', async () => {
    window.matchMedia = vi.fn((query) => ({
      matches: query === '(min-width: 900px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    global.fetch = vi.fn(async (url, options) => {
      if (url === '/api/collections') {
        return Response.json({ collections });
      }
      if (url === '/api/collections/snap/images') {
        return Response.json({ images: desktopImages });
      }
      if (url === '/api/play-records' && options?.method === 'POST') {
        return Response.json({ id: 'play-record-1' }, { status: 201 });
      }
      return Response.json({}, { status: 404 });
    });

    render(<App />);

    await userEvent.type(screen.getByLabelText('이름'), '하늘');
    await userEvent.click(screen.getByRole('button', { name: '시작' }));

    expect(await screen.findByText('1-10 / 12')).toBeInTheDocument();
    expect(document.querySelector('.play-grid')).toHaveClass('count-10');
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
    expect(screen.queryByRole('button', { name: '스냅 월드컵 시작' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '스냅 월드컵 선택 기록 보기' }));

    expect(await screen.findByRole('heading', { name: '선택 기록' })).toBeInTheDocument();
    expect(screen.getByText('사람별 플레이 기록을 선택해 겹치는 이미지와 각자만 고른 이미지를 비교합니다.')).toBeInTheDocument();
  });

  test('renders records in response order and selects latest three by default', async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: '스냅 월드컵 선택 기록 보기' }));

    const recordCheckboxes = await screen.findAllByRole('checkbox');

    expect(recordCheckboxes.map((checkbox) => checkbox.closest('label').textContent)).toEqual([
      expect.stringContaining('하늘Round 3 다운로드'),
      expect.stringContaining('민지'),
      expect.stringContaining('사용자A'),
    ]);
    expect(screen.getByText('3개 기록 비교')).toBeInTheDocument();
    expect(screen.getByLabelText('이름 검색')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /민지/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /하늘.*Round 3 다운로드/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /사용자A/ })).toBeChecked();
  });

  test('compares selected records and recomputes when star filter changes', async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: '스냅 월드컵 선택 기록 보기' }));

    expect(await screen.findByRole('heading', { name: '모두 겹친 이미지' })).toBeInTheDocument();
    expect(screen.getByText('a.jpg')).toBeInTheDocument();
    const partialSection = screen.getByRole('heading', { name: '일부만 겹친 이미지' }).closest('section');
    expect(within(partialSection).getByText('b.jpg')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '각 기록에만 있는 이미지' })).toBeInTheDocument();
    expect(screen.getByText('c.jpg')).toBeInTheDocument();
    expect(screen.getByText('d.jpg')).toBeInTheDocument();
    expect(screen.getByText('이미지 없음')).toBeInTheDocument();
    expect(screen.getAllByText('missing.jpg')).toHaveLength(1);

    await userEvent.selectOptions(screen.getByLabelText('별점 필터'), '최고 별점만');

    expect(screen.getByText('b.jpg')).toBeInTheDocument();
    expect(screen.getByText('c.jpg')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /하늘.*3장.*전체 3장/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /민지.*1장.*전체 2장/ })).toBeChecked();
    expect(screen.queryByText('d.jpg')).not.toBeInTheDocument();
    expect(screen.queryByText('missing.jpg')).not.toBeInTheDocument();
    expect(screen.getByText('최고 별점만')).toBeInTheDocument();
  });

  test('closes record image preview when clicking outside the photo', async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: '스냅 월드컵 선택 기록 보기' }));
    await screen.findByRole('heading', { name: '모두 겹친 이미지' });

    await userEvent.click(screen.getByRole('button', { name: 'a.jpg 확대 보기' }));

    expect(screen.getByRole('dialog', { name: 'a.jpg' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('img', { name: 'a.jpg 원본' }));

    expect(screen.getByRole('dialog', { name: 'a.jpg' })).toBeInTheDocument();

    await userEvent.click(document.querySelector('.image-modal-panel'));

    expect(screen.queryByRole('dialog', { name: 'a.jpg' })).not.toBeInTheDocument();
  });

  test('navigates record image previews with previous and next buttons', async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: '스냅 월드컵 선택 기록 보기' }));
    await screen.findByRole('heading', { name: '선택 기록' });
    await userEvent.click(screen.getByRole('checkbox', { name: /민지/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /사용자A/ }));

    await userEvent.click(screen.getByRole('button', { name: 'a.jpg 확대 보기' }));

    expect(screen.getByRole('dialog', { name: 'a.jpg' })).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '다음 사진' }));

    expect(screen.getByRole('dialog', { name: 'c.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'c.jpg 원본' })).toHaveAttribute('src', '/api/collections/snap/images/c.jpg/original');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '이전 사진' }));

    expect(screen.getByRole('dialog', { name: 'a.jpg' })).toBeInTheDocument();
  });

  test('navigates record image previews with horizontal swipe gestures', async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: '스냅 월드컵 선택 기록 보기' }));
    await screen.findByRole('heading', { name: '선택 기록' });
    await userEvent.click(screen.getByRole('checkbox', { name: /민지/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /사용자A/ }));

    await userEvent.click(screen.getByRole('button', { name: 'a.jpg 확대 보기' }));

    const panel = document.querySelector('.image-modal-panel');
    fireEvent.touchStart(panel, { touches: [{ clientX: 280, clientY: 180 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 110, clientY: 186 }] });

    expect(screen.getByRole('dialog', { name: 'c.jpg' })).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    fireEvent.touchStart(panel, { touches: [{ clientX: 110, clientY: 180 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 280, clientY: 184 }] });

    expect(screen.getByRole('dialog', { name: 'a.jpg' })).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  test('moves the preview while swiping and accepts a shorter swipe', async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: '스냅 월드컵 선택 기록 보기' }));
    await screen.findByRole('heading', { name: '선택 기록' });
    await userEvent.click(screen.getByRole('checkbox', { name: /민지/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /사용자A/ }));

    await userEvent.click(screen.getByRole('button', { name: 'a.jpg 확대 보기' }));

    const panel = document.querySelector('.image-modal-panel');
    const slider = document.querySelector('.modal-image-track');
    fireEvent.touchStart(panel, { touches: [{ clientX: 220, clientY: 180 }] });
    fireEvent.touchMove(panel, { touches: [{ clientX: 184, clientY: 182 }] });

    expect(slider.getAttribute('style')).toContain('-36px');

    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 184, clientY: 182 }] });

    expect(screen.getByRole('dialog', { name: 'c.jpg' })).toBeInTheDocument();
  });

  test('shows a mobile gallery header and thumbnail strip for image previews', async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: '스냅 월드컵 선택 기록 보기' }));
    await screen.findByRole('heading', { name: '선택 기록' });
    await userEvent.click(screen.getByRole('checkbox', { name: /민지/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /사용자A/ }));

    await userEvent.click(screen.getByRole('button', { name: 'a.jpg 확대 보기' }));

    expect(screen.getByRole('button', { name: '확대 보기 닫기' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('확대 이미지 정보')).getByText('a.jpg')).toBeInTheDocument();

    const thumbnailStrip = screen.getByLabelText('확대 이미지 썸네일 목록');
    expect(within(thumbnailStrip).getAllByRole('button')).toHaveLength(3);
    expect(within(thumbnailStrip).getByRole('button', { name: 'c.jpg 보기' })).toHaveAttribute('aria-current', 'false');

    await userEvent.click(within(thumbnailStrip).getByRole('button', { name: 'c.jpg 보기' }));

    expect(screen.getByRole('dialog', { name: 'c.jpg' })).toBeInTheDocument();
    expect(within(thumbnailStrip).getByRole('button', { name: 'c.jpg 보기' })).toHaveAttribute('aria-current', 'true');
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
    expect(submittedForms[0].querySelector('[name="filename"]').value).toMatch(/^하늘_라운드_1_\d{8}-\d{6}\.zip$/);
    expect(submittedForms[0].querySelector('[name="downloadKind"]')).toHaveValue('round-selection');
    expect(submittedForms[0].querySelector('[name="playRecordId"]')).toHaveValue('play-record-1');
    expect(submittedForms[0].querySelector('[name="collectionId"]')).toHaveValue('snap');
    expect(submittedForms[0].querySelector('[name="collectionName"]')).toHaveValue('스냅');
    expect(submittedForms[0].querySelector('[name="nickname"]')).toHaveValue('하늘');
    expect(submittedForms[0].querySelector('[name="round"]')).toHaveValue('1');
    expect(submittedForms[0].querySelector('[name="roundSelections"]')).toHaveValue(
      JSON.stringify([{ round: '1', imageIds: ['a.jpg', 'j.jpg'] }]),
    );

    await userEvent.click(screen.getByRole('button', { name: '다음 라운드 진행' }));

    expect(screen.getByText('1-2 / 2')).toBeInTheDocument();
  });

  test('finishes and stores results from the next round screen', async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText('이름'), '하늘');
    await userEvent.click(screen.getByRole('button', { name: '시작' }));
    await userEvent.click(await screen.findByRole('button', { name: /a.jpg/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await userEvent.click(screen.getByRole('button', { name: /j.jpg/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(await screen.findByRole('heading', { name: 'Round 2 시작' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '선택 마무리' }));

    expect(screen.getByRole('dialog', { name: '선택 마무리 확인' })).toBeInTheDocument();
    expect(screen.getByText('현재까지 고른 2장의 사진으로 결과를 저장합니다.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('dialog', { name: '선택 마무리 확인' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Round 2 시작' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '선택 마무리' }));
    await userEvent.click(screen.getByRole('button', { name: '결과 저장' }));

    expect(await screen.findByRole('heading', { name: '스냅 월드컵 결과' })).toBeInTheDocument();
    expect(screen.getByText('별 1개')).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/play-records/play-record-1/complete',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    const completeCall = global.fetch.mock.calls.find(([url]) => url === '/api/play-records/play-record-1/complete');
    expect(JSON.parse(completeCall[1].body)).toEqual({
      roundSelections: [{ round: '1', imageIds: ['a.jpg', 'j.jpg'] }],
      results: { 1: ['a.jpg', 'j.jpg'] },
    });
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

    expect(submittedForms[0].querySelector('[name="imageIds"]')).toHaveValue(JSON.stringify(['a.jpg', 'b.jpg', 'c.jpg', 'j.jpg']));
    expect(submittedForms[0].querySelector('[name="label"]')).toHaveValue('round-1-2-selected');
    expect(submittedForms[0].querySelector('[name="filename"]').value).toMatch(/^하늘_라운드_1-2_\d{8}-\d{6}\.zip$/);
    expect(submittedForms[0].querySelector('[name="round"]')).toHaveValue('1-2');
    expect(submittedForms[0].querySelector('[name="playRecordId"]')).toHaveValue('play-record-1');
    expect(submittedForms[0].querySelector('[name="roundSelections"]')).toHaveValue(
      JSON.stringify([
        { round: '1', imageIds: ['a.jpg', 'j.jpg'] },
        { round: '1-1', imageIds: ['b.jpg'] },
        { round: '1-2', imageIds: ['c.jpg'] },
      ]),
    );

    await userEvent.click(screen.getByRole('button', { name: '다음 라운드 진행' }));

    expect(screen.getByText('1-4 / 4')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /\.jpg/ }).map((button) => button.getAttribute('aria-label'))).toEqual([
      'a.jpg',
      'b.jpg',
      'c.jpg',
      'j.jpg',
    ]);
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

    await userEvent.click(screen.getByRole('img', { name: 'a.jpg 원본' }));

    expect(screen.getByRole('dialog', { name: 'a.jpg' })).toBeInTheDocument();

    await userEvent.click(document.querySelector('.image-modal-panel'));

    expect(screen.queryByRole('dialog', { name: 'a.jpg' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/play-records/play-record-1/complete',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"roundSelections"'),
        }),
      );
    });
    expect(global.fetch.mock.calls.filter(([url]) => url === '/api/play-records/play-record-1/complete')).toHaveLength(1);
  });

  test('navigates final result image previews with previous and next buttons', async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText('이름'), '하늘');
    await userEvent.click(screen.getByRole('button', { name: '시작' }));
    await userEvent.click(await screen.findByRole('button', { name: /a.jpg/ }));
    await userEvent.click(screen.getByRole('button', { name: /b.jpg/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await userEvent.click(await screen.findByRole('button', { name: '선택 마무리' }));
    await userEvent.click(screen.getByRole('button', { name: '결과 저장' }));

    expect(await screen.findByRole('heading', { name: '스냅 월드컵 결과' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'a.jpg 확대 보기' }));

    expect(screen.getByRole('dialog', { name: 'a.jpg' })).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '다음 사진' }));

    expect(screen.getByRole('dialog', { name: 'b.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'b.jpg 원본' })).toHaveAttribute('src', '/api/collections/snap/images/b.jpg/original');
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '이전 사진' }));

    expect(screen.getByRole('dialog', { name: 'a.jpg' })).toBeInTheDocument();
  });
});
