// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const push = vi.fn();
const replace = vi.fn();
let currentSearch = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/directory',
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

import { SearchBox } from '@/components/public/search-box';
import { FilterBar } from '@/components/public/filter-bar';

const QIRAAT_A = '11111111-1111-4111-8111-111111111111';
const QIRAAT_B = '22222222-2222-4222-8222-222222222222';
const RIWAYAT_A = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  push.mockReset();
  replace.mockReset();
  currentSearch = '';
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SearchBox', () => {
  it('debounces suggestion requests and lists results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [{ id: 'abc', name: 'Guru Ujian', arabic: 'معلم', location: 'Kelantan' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SearchBox />);
    const input = screen.getByRole('combobox');
    for (const value of ['g', 'gu', 'gur', 'guru']) fireEvent.change(input, { target: { value } });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/search/suggest?q=guru');
    expect(await screen.findByRole('option', { name: /Guru Ujian/ })).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('navigates to a suggestion with the keyboard', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [{ id: 'abc', name: 'Guru Ujian', arabic: null, location: '' }] }) }),
    );
    render(<SearchBox />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'guru' } });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    await screen.findByRole('option', { name: /Guru Ujian/ });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Guru Ujian/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.submit(input.closest('form')!);
    expect(push).toHaveBeenCalledWith('/directory/abc');
  });

  it('submits a full search and resets pagination', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) }));
    currentSearch = 'halaman=3&negeri=kelantan';
    render(<SearchBox />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Ahmad' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(push).toHaveBeenCalledWith('/directory?negeri=kelantan&q=Ahmad');
  });

  it('updates live results after the debounce', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) }));
    render(<SearchBox live />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'عبد' } });
    expect(replace).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(replace).toHaveBeenCalledWith(`/directory?q=${encodeURIComponent('عبد')}`, { scroll: false });
  });
});

describe('FilterBar (state filtering)', () => {
  const props = {
    basePath: '/states/kelantan',
    districts: [{ id: '44444444-4444-4444-8444-444444444444', state_id: 's', name: 'Kota Bharu', slug: 'kota-bharu', teacher_count: 3 }],
    qiraat: [
      { id: QIRAAT_A, label: 'Qiraat A' },
      { id: QIRAAT_B, label: 'Qiraat B' },
    ],
    riwayat: [{ id: RIWAYAT_A, label: 'Riwayat A1', parentId: QIRAAT_A }],
    institutions: [],
  };

  it('filters by district and resets to page 1', () => {
    render(<FilterBar {...props} params={{ halaman: 4, q: 'ali' }} />);
    fireEvent.change(screen.getByLabelText('Daerah'), { target: { value: props.districts[0].id } });
    expect(push).toHaveBeenCalledWith(`/states/kelantan?q=ali&daerah=${props.districts[0].id}`, { scroll: false });
  });

  it('clears an incompatible riwayat when the qiraat changes', () => {
    render(<FilterBar {...props} params={{ halaman: 1, qiraat: QIRAAT_A, riwayat: RIWAYAT_A }} />);
    fireEvent.change(screen.getByLabelText('Qiraat'), { target: { value: QIRAAT_B } });
    expect(push).toHaveBeenCalledWith(`/states/kelantan?qiraat=${QIRAAT_B}`, { scroll: false });
  });

  it('only offers riwayat belonging to the selected qiraat', () => {
    render(<FilterBar {...props} params={{ halaman: 1, qiraat: QIRAAT_B }} />);
    expect(screen.getByLabelText('Riwayat').querySelectorAll('option')).toHaveLength(1);
  });

  it('disables the institution filter when there are none', () => {
    render(<FilterBar {...props} params={{ halaman: 1 }} />);
    expect(screen.getByLabelText('Institusi')).toBeDisabled();
  });
});
