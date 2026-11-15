// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionConfig } from 'framer-motion';
import { ProfileTabs } from '@/components/profile/profile-tabs';
import { profile } from './fixtures';
import type { PublicSanadDocument } from '@/types/public';

function renderTabs(data = profile, documents: PublicSanadDocument[] = []) {
  return render(
    <MotionConfig reducedMotion="always">
      <ProfileTabs data={data} documents={documents} />
    </MotionConfig>,
  );
}

describe('ProfileTabs', () => {
  it('shows the five required tabs with Profil selected', () => {
    renderTabs();
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''));
    expect(tabs).toEqual(['Profil', 'Kelayakan', 'Senarai Sanad', 'Papar Sanad', 'Institusi']);
    expect(screen.getByRole('tab', { name: 'Profil' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Biografi ringkas ujian.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'kelas@ujian.test' })).toHaveAttribute('href', 'mailto:kelas@ujian.test');
  });

  it('switches tabs by click and arrow keys', async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.click(screen.getByRole('tab', { name: /Senarai Sanad/ }));
    expect(await screen.findByText('Sanad Hafs Ujian')).toBeInTheDocument();

    screen.getByRole('tab', { name: /Senarai Sanad/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Papar Sanad' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Tiada sijil sanad dipaparkan')).toBeInTheDocument();
  });

  it('opens a sanad record to reveal its details', async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.click(screen.getByRole('tab', { name: /Senarai Sanad/ }));
    const toggle = await screen.findByRole('button', { name: /Sanad Hafs Ujian/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('SND-000001')).toBeInTheDocument();
    expect(screen.getByText('Syeikh Ujian')).toBeInTheDocument();
    expect(screen.getByText(/bukan pengisytiharan kesahihan sanad/)).toBeInTheDocument();
  });

  it('shows empty states instead of hidden data', async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.click(screen.getByRole('tab', { name: 'Kelayakan' }));
    expect(await screen.findByText('Tiada kelayakan awam')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Institusi' }));
    expect(await screen.findByText('Tiada institusi awam')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Papar Sanad' }));
    expect(await screen.findByText('Tiada sijil sanad dipaparkan')).toBeInTheDocument();
  });

  it('lists approved public sanad certificates with a view link and no file names', async () => {
    const user = userEvent.setup();
    const doc: PublicSanadDocument = {
      id: '11111111-1111-4111-8111-111111111111',
      mime_type: 'application/pdf',
      sanad_chain_id: null,
      chain_title: 'Sanad Hafs Ujian',
      reviewed_at: '2026-01-05T00:00:00Z',
    };
    renderTabs(profile, [doc]);
    await user.click(screen.getByRole('tab', { name: /Papar Sanad/ }));
    const link = await screen.findByRole('link', { name: /Papar sanad/ });
    expect(link).toHaveAttribute('href', `/api/public-documents/${doc.id}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/Rantaian: Sanad Hafs Ujian/)).toBeInTheDocument();
    expect(screen.getByText(/bukan pengisytiharan kesahihan sanad/)).toBeInTheDocument();
  });
});
