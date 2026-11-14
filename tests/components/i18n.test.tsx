// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n/client';
import { TeacherCard } from '@/components/public/teacher-card';
import { VerificationBadges } from '@/components/public/verification-badges';
import { StateGrid } from '@/components/public/state-grid';
import { states, teacher } from './fixtures';

describe('localised public components', () => {
  it('renders English labels', () => {
    render(
      <I18nProvider locale="en">
        <TeacherCard teacher={teacher} />
      </I18nProvider>,
    );
    expect(screen.getByText('2 reviewed sanad records')).toBeInTheDocument();
    expect(screen.getByText('Demonstration record (fictional)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View profile of Guru Ujian Fiktif' })).toBeInTheDocument();
  });

  it('renders Arabic badge labels with no authenticity claim', () => {
    const { container } = render(
      <I18nProvider locale="ar">
        <VerificationBadges profileVerified documentsReviewed sanadReviewed />
      </I18nProvider>,
    );
    expect(screen.getByText('ملف موثَّق')).toBeInTheDocument();
    expect(screen.getByText('سلسلة سند مُراجَعة')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/صحيح|100%/);
  });

  it('translates state groups but keeps official state names', () => {
    render(
      <I18nProvider locale="ar">
        <StateGrid states={states} />
      </I18nProvider>,
    );
    expect(screen.getByRole('region', { name: 'الأقاليم الاتحادية' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kelantan/ })).toBeInTheDocument();
  });
});
