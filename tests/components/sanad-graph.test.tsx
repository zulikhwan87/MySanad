// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionConfig } from 'framer-motion';
import { SanadGraph } from '@/components/sanad/sanad-graph';
import type { SanadGraphData } from '@/lib/sanad/graph';

beforeAll(() => {
  // React Flow relies on browser layout APIs that jsdom lacks.
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', RO);
  // @ts-expect-error minimal DOMMatrix for React Flow's viewport parsing
  window.DOMMatrixReadOnly = class {
    m22 = 1;
    constructor() {}
  };
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: { get: () => 600, configurable: true },
    offsetWidth: { get: () => 900, configurable: true },
  });
});

// Fictional fixture
const data: SanadGraphData = {
  chains: [{ id: 'c1', title: 'Sanad Ujian', qiraat_id: 'q1', riwayat_id: 'r1', qiraat: 'Qiraat Ujian', riwayat: 'Riwayat Ujian' }],
  nodes: [
    { id: 'a', full_name_rumi: 'Syeikh Atas Ujian', full_name_arabic: 'الشيخ', generation_category: 'Masyaikh Mutaakhirin', biography: 'Biografi ujian.' },
    { id: 'b', full_name_rumi: 'Guru Ujian', full_name_arabic: null, generation_category: 'Guru Nusantara / Semasa', is_self: true, linked_teacher_id: 't1' },
  ],
  edges: [
    {
      id: 'e1',
      chain_id: 'c1',
      source: 'a',
      target: 'b',
      transmission_relationship: 'Talaqqi wa al-Ardh',
      transmission_location: 'Kota Bharu',
      supporting_evidence: 'BUKTI-SULIT',
      verification_status: 'draft',
    },
  ],
};

function renderGraph(props: Partial<React.ComponentProps<typeof SanadGraph>> = {}) {
  return render(
    <MotionConfig reducedMotion="always">
      <SanadGraph data={data} mode="public" title="Ujian" allowExport={false} {...props} />
    </MotionConfig>,
  );
}

describe('SanadGraph', () => {
  it('renders Rumi and Arabic labels and toggles label mode', async () => {
    const user = userEvent.setup();
    renderGraph();
    expect(await screen.findByText('Syeikh Atas Ujian')).toBeInTheDocument();
    expect(screen.getByText('الشيخ')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Label'), 'rumi');
    expect(screen.queryByText('الشيخ')).toBeNull();
  });

  it('shows node details on click with a link to the public profile', async () => {
    renderGraph();
    fireEvent.click(await screen.findByText('Guru Ujian'));
    const panel = screen.getByRole('complementary', { name: 'Butiran pilihan' });
    expect(within(panel).getByRole('heading', { name: 'Guru Ujian' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /Lihat profil guru/ })).toHaveAttribute('href', '/directory/t1');
  });

  it('searches nodes and reports the match count', async () => {
    const user = userEvent.setup();
    renderGraph();
    await user.type(screen.getByLabelText('Cari perawi'), 'syeikh');
    expect(screen.getByText('1 padanan')).toBeInTheDocument();
  });

  it('offers an accessible list view of relationships', async () => {
    const user = userEvent.setup();
    renderGraph();
    await user.click(screen.getByRole('button', { name: /Paparan senarai/ }));
    const item = screen.getByRole('button', { name: /Syeikh Atas Ujian → Guru Ujian/ });
    await user.click(item);
    const panel = screen.getByRole('complementary', { name: 'Butiran pilihan' });
    expect(within(panel).getByText('Kota Bharu')).toBeInTheDocument();
  });

  it('never shows private evidence in public mode, but does in private mode', async () => {
    const user = userEvent.setup();
    const { unmount } = renderGraph();
    await user.click(screen.getByRole('button', { name: /Paparan senarai/ }));
    await user.click(screen.getByRole('button', { name: /→ Guru Ujian/ }));
    expect(screen.queryByText('BUKTI-SULIT')).toBeNull();
    unmount();
    renderGraph({ mode: 'private' });
    await user.click(screen.getByRole('button', { name: /Paparan senarai/ }));
    await user.click(screen.getByRole('button', { name: /→ Guru Ujian/ }));
    expect(screen.getByText('BUKTI-SULIT')).toBeInTheDocument();
  });

  it('shows export buttons only when export is allowed', async () => {
    const { unmount } = renderGraph();
    expect(screen.queryByRole('button', { name: /PNG/ })).toBeNull();
    unmount();
    renderGraph({ allowExport: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /PNG/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /JSON/ })).toBeInTheDocument();
  });

  it('always shows the documentation disclaimer', () => {
    renderGraph();
    expect(screen.getByText(/bukan pengisytiharan kesahihan sanad/)).toBeInTheDocument();
  });

  it('renders private-mode actions for the selected node', async () => {
    renderGraph({ mode: 'private', renderNodeActions: (n) => <button type="button">Tindakan {n.full_name_rumi}</button> });
    fireEvent.click(await screen.findByText('Syeikh Atas Ujian'));
    expect(screen.getByRole('button', { name: 'Tindakan Syeikh Atas Ujian' })).toBeInTheDocument();
  });
});
