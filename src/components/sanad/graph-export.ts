'use client';

import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react';
import { GRAPH_DISCLAIMER } from '@/lib/sanad/graph';

function download(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

export function safeFilename(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 60) || 'graf-sanad'
  );
}

/** PNG of the whole graph with the documentation disclaimer drawn underneath. */
export async function exportGraphPng(nodes: Node[], title: string) {
  const viewport = document.querySelector<HTMLElement>('.sanad-flow .react-flow__viewport');
  if (!viewport || nodes.length === 0) return;
  const { toPng } = await import('html-to-image');
  const bounds = getNodesBounds(nodes);
  const width = Math.min(4000, Math.max(800, bounds.width + 160));
  const height = Math.min(4000, Math.max(500, bounds.height + 160));
  const vp = getViewportForBounds(bounds, width, height, 0.2, 2, 0.08);
  const graph = await toPng(viewport, {
    backgroundColor: '#ffffff',
    width,
    height,
    style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
  });

  const img = new Image();
  img.src = graph;
  await img.decode();
  const footer = 90;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height + footer;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = '#225339';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`MySanad · ${title}`, 24, height + 30);
  ctx.fillStyle = '#4b5563';
  ctx.font = '12px sans-serif';
  ctx.fillText(GRAPH_DISCLAIMER.slice(0, 150), 24, height + 52);
  ctx.fillText(`${GRAPH_DISCLAIMER.slice(150)} Dieksport ${new Date().toLocaleDateString('ms-MY')}.`, 24, height + 70);
  download(canvas.toDataURL('image/png'), `${safeFilename(title)}.png`);
}

export function exportJson(json: string, title: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  download(url, `${safeFilename(title)}.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
