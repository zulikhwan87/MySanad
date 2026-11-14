// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { StateGrid } from '@/components/public/state-grid';
import { TeacherCard } from '@/components/public/teacher-card';
import { VerificationBadges } from '@/components/public/verification-badges';
import { initials, isTrustedPhotoUrl } from '@/components/public/teacher-avatar';
import { states, teacher } from './fixtures';

describe('StateGrid (state selector)', () => {
  it('renders all 13 states and 3 federal territories as links with counts', () => {
    render(<StateGrid states={states} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(16);
    const kelantan = screen.getByRole('link', { name: /Kelantan/ });
    expect(kelantan).toHaveAttribute('href', '/states/kelantan');
    expect(within(kelantan).getByLabelText('7 guru')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Wilayah Persekutuan' }).querySelectorAll('a')).toHaveLength(3);
  });

  it('highlights the selected state', () => {
    render(<StateGrid states={states} selectedSlug="sabah" />);
    expect(screen.getByRole('link', { name: /Sabah/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Kelantan/ })).not.toHaveAttribute('aria-current');
  });
});

describe('TeacherCard', () => {
  it('shows the public summary and a profile link', () => {
    render(<TeacherCard teacher={teacher} />);
    expect(screen.getByRole('heading', { name: 'Guru Ujian Fiktif' })).toBeInTheDocument();
    expect(screen.getByText('Kota Bharu, Kelantan')).toBeInTheDocument();
    expect(screen.getByText('Maahad Ujian')).toBeInTheDocument();
    expect(screen.getByText(/2 rekod sanad disemak/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lihat profil Guru Ujian Fiktif/ })).toHaveAttribute('href', `/directory/${teacher.id}`);
  });

  it('labels demo records as fictional', () => {
    render(<TeacherCard teacher={teacher} />);
    expect(screen.getByText('Rekod Demonstrasi (fiksyen)')).toBeInTheDocument();
  });

  it('never loads a photo from an untrusted host', () => {
    render(<TeacherCard teacher={teacher} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('VerificationBadges', () => {
  it('uses accurate review labels and no authenticity claims', () => {
    const { container } = render(<VerificationBadges profileVerified documentsReviewed sanadReviewed />);
    expect(screen.getByText('Profil Disahkan')).toBeInTheDocument();
    expect(screen.getByText('Dokumen Disemak')).toBeInTheDocument();
    expect(screen.getByText('Jalur Sanad Disemak')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/100%|sahih|authentic/i);
  });

  it('renders only the badges that were earned', () => {
    render(<VerificationBadges profileVerified documentsReviewed={false} sanadReviewed={false} />);
    expect(screen.queryByText('Dokumen Disemak')).toBeNull();
    expect(screen.queryByText('Jalur Sanad Disemak')).toBeNull();
  });
});

describe('teacher avatar helpers', () => {
  it('accepts only the MySanad public photo bucket', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    expect(isTrustedPhotoUrl('https://abc.supabase.co/storage/v1/object/public/teacher-photos/u/p.jpg')).toBe(true);
    expect(isTrustedPhotoUrl('https://abc.supabase.co/storage/v1/object/public/teacher-photos/../x')).toBe(false);
    expect(isTrustedPhotoUrl('https://evil.example/storage/v1/object/public/teacher-photos/p.jpg')).toBe(false);
    expect(isTrustedPhotoUrl(null)).toBe(false);
  });

  it('builds initials while skipping nasab particles', () => {
    expect(initials('Ahmad bin Ali')).toBe('AA');
    expect(initials('[DEMO] Fatimah binti Yusof')).toBe('FY');
  });
});
