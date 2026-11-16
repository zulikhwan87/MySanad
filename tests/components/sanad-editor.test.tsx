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
  attachReferenceChainAction: vi.fn(async () => ({ ok: true, message: '3 hubungan disalin.' })),
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
import { perawiFrom } from '@/components/sanad/editor/reference-attach';
import type { ActiveReference } from '@/lib/data/reference-chains';

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

  it('copies from an active reference only after choosing the perawi, with a preview of what is copied', async () => {
    const ref: ActiveReference = {
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Rujukan Hafs',
      riwayat_id: null,
      riwayat: null,
      tariq: null,
      perawi: [
        { id: 'r0', name: 'Syeikh Permulaan', arabic: null, depth: 0 },
        { id: 'r1', name: 'Syeikh Tengah', arabic: null, depth: 1 },
        { id: 'r2', name: 'Imam Atas', arabic: null, depth: 2 },
      ],
      links: [
        { source: 'r1', target: 'r0' },
        { source: 'r2', target: 'r1' },
      ],
    };
    expect(perawiFrom(ref, 'r1').map((p) => p.id)).toEqual(['r1', 'r2']);

    render(<SanadEditor chainId={CHAIN} graph={graph} editable title="Sanad" references={[ref]} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Sambung dengan rantaian rujukan/ })[0]);
    const copy = screen.getByRole('button', { name: /Salin ke rantaian saya/ });
    expect((copy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Guru kepada/), { target: { value: 'r0' } });
    expect(screen.getByText(/Akan disalin \(3 perawi\)/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(copy);
    });
    expect(actions.attachReferenceChainAction).toHaveBeenCalledWith(CHAIN, 'shaykh', ref.id, 'r0');
  });

  it('hides the reference option when none are active', () => {
    render(<SanadEditor chainId={CHAIN} graph={graph} editable title="Sanad" />);
    expect(screen.queryByRole('button', { name: /Sambung dengan rantaian rujukan/ })).toBeNull();
  });
});
