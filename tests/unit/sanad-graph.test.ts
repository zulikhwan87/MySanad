import { describe, expect, it } from 'vitest';
import {
  downstream,
  filterByChains,
  graphExportJson,
  layoutGraph,
  searchGraphNodes,
  upstream,
  type SanadGraphData,
} from '@/lib/sanad/graph';
import { normalizeSearchText } from '@/lib/text/normalize';
import { NewSanadChainSchema, NodeChoiceSchema, SanadNodeSchema, transmissionOptions } from '@/lib/validations/sanad';

const UUID = '11111111-1111-4111-8111-111111111111';

// Fictional fixture:  P → A → B → T,  P → C → T  (branch), second chain  P → D
const graph: SanadGraphData = {
  chains: [
    { id: 'c1', title: 'Hafs', qiraat_id: 'q1', riwayat_id: 'r1' },
    { id: 'c2', title: 'Warsy', qiraat_id: 'q2', riwayat_id: 'r2' },
  ],
  nodes: [
    { id: 'P', full_name_rumi: 'Perawi Asal', full_name_arabic: 'الرَّاوِي' },
    { id: 'A', full_name_rumi: 'Abdullah Ujian', full_name_arabic: 'عبد الله', alternative_spellings: ['Abdollah'] },
    { id: 'B', full_name_rumi: 'Bakar Ujian', full_name_arabic: null },
    { id: 'C', full_name_rumi: 'Cabang Ujian', full_name_arabic: null },
    { id: 'T', full_name_rumi: 'Guru Ujian', full_name_arabic: null, is_self: true },
    { id: 'D', full_name_rumi: 'Dawud Ujian', full_name_arabic: null },
  ],
  edges: [
    { id: 'e1', chain_id: 'c1', source: 'P', target: 'A' },
    { id: 'e2', chain_id: 'c1', source: 'A', target: 'B' },
    { id: 'e3', chain_id: 'c1', source: 'B', target: 'T', supporting_evidence: 'SULIT', notes: 'NOTA' },
    { id: 'e4', chain_id: 'c1', source: 'P', target: 'C' },
    { id: 'e5', chain_id: 'c1', source: 'C', target: 'T' },
    { id: 'e6', chain_id: 'c2', source: 'P', target: 'D' },
  ],
};

describe('layoutGraph', () => {
  it('places shaykhs above students using the longest path', () => {
    const pos = layoutGraph(graph.nodes, graph.edges);
    const rank = (id: string) => pos.get(id)!.rank;
    expect(rank('P')).toBe(0);
    expect(rank('A')).toBe(1);
    expect(rank('C')).toBe(1);
    expect(rank('B')).toBe(2);
    expect(rank('T')).toBe(3); // longest route P→A→B→T, not the shorter branch
    expect(pos.get('T')!.y).toBeGreaterThan(pos.get('B')!.y);
  });

  it('never overlaps nodes in the same rank', () => {
    const pos = layoutGraph(graph.nodes, graph.edges);
    const rank1 = ['A', 'C', 'D'].map((id) => pos.get(id)!.x).sort((a, b) => a - b);
    for (let i = 1; i < rank1.length; i += 1) expect(rank1[i] - rank1[i - 1]).toBeGreaterThanOrEqual(220);
  });

  it('survives cycles and dangling edges without hanging', () => {
    const pos = layoutGraph(
      [
        { id: 'x', full_name_rumi: 'X', full_name_arabic: null },
        { id: 'y', full_name_rumi: 'Y', full_name_arabic: null },
      ],
      [
        { id: '1', chain_id: 'c', source: 'x', target: 'y' },
        { id: '2', chain_id: 'c', source: 'y', target: 'x' },
        { id: '3', chain_id: 'c', source: 'x', target: 'missing' },
      ],
    );
    expect(pos.size).toBe(2);
  });
});

describe('path highlighting', () => {
  it('finds the full sanad above a node, through every branch', () => {
    const up = upstream('T', graph.edges);
    expect([...up.nodes].sort()).toEqual(['A', 'B', 'C', 'P', 'T']);
    expect([...up.edges].sort()).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
  });

  it('finds everyone who received from a node', () => {
    const down = downstream('A', graph.edges);
    expect([...down.nodes].sort()).toEqual(['A', 'B', 'T']);
  });
});

describe('filterByChains', () => {
  it('keeps only edges and nodes of matching chains', () => {
    const f = filterByChains(graph, (c) => c.riwayat_id === 'r2');
    expect(f.chains.map((c) => c.id)).toEqual(['c2']);
    expect(f.edges.map((e) => e.id)).toEqual(['e6']);
    expect(f.nodes.map((n) => n.id).sort()).toEqual(['D', 'P']);
  });
});

describe('searchGraphNodes', () => {
  it('matches Rumi, Arabic without harakat, and alternative spellings', () => {
    expect(searchGraphNodes(graph.nodes, 'bakar')).toEqual(['B']);
    expect(searchGraphNodes(graph.nodes, 'الراوي')).toEqual(['P']);
    expect(searchGraphNodes(graph.nodes, 'abdollah')).toEqual(['A']);
    expect(searchGraphNodes(graph.nodes, '  ')).toEqual([]);
  });
});

describe('graphExportJson', () => {
  it('includes the disclaimer and strips private fields in public mode', () => {
    const pub = JSON.parse(graphExportJson(graph, 'public'));
    expect(pub.disclaimer).toMatch(/bukan pengisytiharan kesahihan/);
    expect(JSON.stringify(pub)).not.toContain('SULIT');
    expect(JSON.stringify(pub)).not.toContain('is_self');
    const priv = JSON.parse(graphExportJson(graph, 'private'));
    expect(JSON.stringify(priv)).toContain('SULIT');
  });
});

describe('normalizeSearchText (TS twin of the SQL function)', () => {
  it('matches the database behaviour', () => {
    expect(normalizeSearchText('ABDULLAH  Bin-Ismail')).toBe('abdullah bin ismail');
    expect(normalizeSearchText('عَبْدُ ٱللَّهِ')).toBe('عبد الله');
    expect(normalizeSearchText("Nafi'")).toBe('nafi');
    expect(normalizeSearchText('مدرسة')).toBe('مدرسه');
  });
});

describe('sanad schemas', () => {
  it('validates transmitters', () => {
    expect(SanadNodeSchema.safeParse({ full_name_rumi: 'Syeikh Ujian', generation_category: 'Masyaikh Mutaakhirin' }).success).toBe(true);
    expect(SanadNodeSchema.safeParse({ full_name_rumi: 'S', generation_category: 'Masyaikh Mutaakhirin' }).success).toBe(false);
    expect(SanadNodeSchema.safeParse({ full_name_rumi: 'Syeikh', full_name_arabic: 'Latin', generation_category: 'Perawi' }).success).toBe(false);
    expect(SanadNodeSchema.safeParse({ full_name_rumi: 'Syeikh', generation_category: 'Malaikat' }).success).toBe(false);
    // Teachers enter names only: the category is optional.
    const nameOnly = SanadNodeSchema.safeParse({ full_name_rumi: 'Syeikh Nama Sahaja', generation_category: '' });
    expect(nameOnly.success && nameOnly.data.generation_category).toBe(undefined);
    const refs = SanadNodeSchema.parse({
      full_name_rumi: 'Syeikh',
      generation_category: 'Perawi',
      scholarly_references: 'Ghayat al-Nihayah (1/413)\nSiyar, jilid 4',
    });
    expect(refs.scholarly_references).toEqual(['Ghayat al-Nihayah (1/413)', 'Siyar, jilid 4']);
  });

  it('requires an explicit choice: an existing id or a full new record', () => {
    expect(NodeChoiceSchema.safeParse({ mode: 'existing', node_id: '' }).success).toBe(false);
    expect(NodeChoiceSchema.safeParse({ mode: 'existing', node_id: UUID }).success).toBe(true);
    expect(NodeChoiceSchema.safeParse({ mode: 'merge', node_id: UUID }).success).toBe(false);
  });

  it('validates a whole new chain', () => {
    const ok = NewSanadChainSchema.safeParse({
      chain: { title: 'Sanad Hafs', qiraat_id: UUID, riwayat_id: UUID, transmission_method: 'Talaqqi', allow_public_graph_export: false },
      shaykh: { mode: 'existing', node_id: UUID },
      edge: { transmission_relationship: 'Talaqqi wa al-Ardh' },
    });
    expect(ok.success).toBe(true);
    const future = NewSanadChainSchema.safeParse({
      chain: { title: 'Sanad Hafs', qiraat_id: UUID, riwayat_id: UUID, transmission_method: 'Talaqqi', ijazah_date: '2999-01-01' },
      shaykh: { mode: 'existing', node_id: UUID },
      edge: { transmission_relationship: 'Talaqqi wa al-Ardh' },
    });
    expect(future.success).toBe(false);
  });

  it('does not require the method of receiving', () => {
    const r = NewSanadChainSchema.safeParse({
      chain: { title: 'Sanad Hafs', qiraat_id: UUID, riwayat_id: UUID, transmission_method: '' },
      shaykh: { mode: 'existing', node_id: UUID },
      edge: { transmission_relationship: '' },
    });
    expect(r.success && [r.data.chain.transmission_method, r.data.edge.transmission_relationship]).toEqual([undefined, undefined]);
  });

  it('offers the two reading methods, keeping an older stored value visible', () => {
    expect(transmissionOptions().map((o) => o.value)).toEqual([
      'Bacaan secara hafazan (ghaiban)',
      'Bacaan secara melihat mushaf',
      'Bacaan secara dalam talian (online)',
    ]);
    expect(transmissionOptions('Talaqqi Musyafahah Khatam 30 Juzuk')).toHaveLength(4);
    expect(transmissionOptions('Bacaan secara melihat mushaf')).toHaveLength(3);
  });
});
