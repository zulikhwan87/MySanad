// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

const search = vi.hoisted(() => vi.fn());
vi.mock('@/lib/actions/sanad-actions', () => ({ searchLinkableNodesAction: search }));

import { NodePicker } from '@/components/sanad/editor/node-picker';
import type { NodeChoiceInput } from '@/lib/validations/sanad';

const candidate = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name_rumi: 'Syeikh Sama Nama',
  full_name_arabic: null,
  historical_title: null,
  generation_category: 'Masyaikh Mutaakhirin',
  death_year_hijri: '1400H',
  country_or_region: 'Mesir',
  verification_status: 'approved',
  is_mine: false,
};

function Harness({ onValue }: { onValue: (v: NodeChoiceInput) => void }) {
  const [value, setValue] = useState<NodeChoiceInput>({ mode: 'new', node: { full_name_rumi: '', generation_category: 'Masyaikh Mutaakhirin' } });
  return (
    <NodePicker
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
      errors={{}}
    />
  );
}

describe('NodePicker', () => {
  it('warns about similar names and links only on an explicit choice (never auto-merges)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    search.mockResolvedValue([candidate]);
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    fireEvent.change(screen.getByLabelText(/Nama \(Rumi\)/), { target: { value: 'Syeikh Sama Nama' } });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(await screen.findByText(/nama serupa sudah wujud/)).toBeInTheDocument();
    expect(screen.getByText(/tidak menggabungkan rekod secara automatik/)).toBeInTheDocument();
    // Still creating a NEW record until the teacher chooses otherwise.
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'new' }));

    fireEvent.click(screen.getByRole('button', { name: /Syeikh Sama Nama/ }));
    expect(onValue).toHaveBeenLastCalledWith({ mode: 'existing', node_id: candidate.id });
    vi.useRealTimers();
  });
});
