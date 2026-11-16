// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { GraphNodeData, SanadGraphData } from '@/lib/sanad/graph';

const actions = vi.hoisted(() => ({
  updateNodeAction: vi.fn(async () => ({ ok: true, message: 'Pembetulan disimpan.' })),
  replaceNodeAction: vi.fn(async () => ({ ok: true, message: 'Perawi diganti.' })),
  removeNodeFromChainAction: vi.fn(async () => ({ ok: true, message: 'Perawi dibuang.' })),
  addShaykhAction: vi.fn(),
  deleteEdgeAction: vi.fn(),
  linkNodesAction: vi.fn(),
  updateEdgeAction: vi.fn(),
  searchLinkableNodesAction: vi.fn(async () => []),
}));
vi.mock('@/lib/actions/sanad-actions', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
// The real graph is a canvas; render each node's action area directly instead.
vi.mock('@/components/sanad/sanad-graph-lazy', () => ({
  SanadGraphLazy: ({ data, renderNodeActions }: { data: SanadGraphData; renderNodeActions?: (n: GraphNodeData) => ReactNode }) => (
    <div>
      {data.nodes.map((n) => (
        <section key={n.id} aria-label={n.full_name_rumi}>
          {renderNodeActions?.(n)}
        </section>
      ))}
    </div>
  ),
}));

import { SanadEditor } from '@/components/sanad/editor/sanad-editor';

const CHAIN = '22222222-2222-4222-8222-222222222222';
const graph: SanadGraphData = {
  nodes: [
    { id: 'shaykh', full_name_rumi: 'Syeikh Nama Tersilap', full_name_arabic: null, verification_status: 'approved', is_mine: false },
    { id: 'self', full_name_rumi: 'Guru Sendiri', full_name_arabic: null, is_self: true, verification_status: 'approved' },
  ],
  edges: [],
  chains: [],
};

describe('SanadEditor corrections', () => {
  it('lets a verified transmitter be corrected, replaced or removed, but not the teacher', async () => {
    render(<SanadEditor chainId={CHAIN} graph={graph} editable title="Sanad" />);
    const self = screen.getByRole('region', { name: 'Guru Sendiri' });
    expect(self.textContent).not.toContain('Betulkan');

    fireEvent.click(screen.getByRole('button', { name: /Betulkan nama/ }));
    expect(screen.getByText(/disemak semula oleh pentadbir/)).toBeTruthy();
    const name = screen.getByLabelText(/Nama \(Rumi\)/) as HTMLInputElement;
    expect(name.value).toBe('Syeikh Nama Tersilap');
    expect(screen.queryByLabelText(/Kategori generasi/)).toBeNull();
    fireEvent.change(name, { target: { value: 'Syeikh Nama Betul' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    });
    expect(actions.updateNodeAction).toHaveBeenCalledWith(CHAIN, 'shaykh', expect.objectContaining({ full_name_rumi: 'Syeikh Nama Betul' }));

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Buang daripada rantaian/ }));
    });
    expect(actions.removeNodeFromChainAction).toHaveBeenCalledWith(CHAIN, 'shaykh');
  });

  it('shows no editing actions on a locked chain', () => {
    render(<SanadEditor chainId={CHAIN} graph={graph} editable={false} title="Sanad" />);
    expect(screen.queryByRole('button', { name: /Betulkan nama/ })).toBeNull();
  });
});
