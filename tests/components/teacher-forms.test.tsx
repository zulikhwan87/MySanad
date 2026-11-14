// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
  usePathname: () => '/teacher/register',
}));

const actions = vi.hoisted(() => ({
  savePersonalStepAction: vi.fn(),
  saveVisibilityAction: vi.fn(),
  submitProfileAction: vi.fn(),
  withdrawSubmissionAction: vi.fn(),
  saveEducationAction: vi.fn(),
  deleteEducationAction: vi.fn(),
}));
vi.mock('@/lib/actions/teacher-actions', () => actions);

import { PersonalForm } from '@/components/teacher/forms/personal-form';
import { VisibilityForm } from '@/components/teacher/forms/visibility-form';
import { SubmitPanel } from '@/components/teacher/forms/submit-panel';
import { EducationManager } from '@/components/teacher/forms/education-manager';
import { WizardStepper } from '@/components/teacher/wizard-stepper';
import { DEFAULT_SETTINGS, type TeacherReferenceData } from '@/types/teacher';

const reference: TeacherReferenceData = {
  states: [
    { id: 's-kel', name: 'Kelantan', slug: 'kelantan' },
    { id: 's-sel', name: 'Selangor', slug: 'selangor' },
  ],
  districts: [
    { id: 'd-kb', state_id: 's-kel', name: 'Kota Bharu' },
    { id: 'd-sa', state_id: 's-sel', name: 'Shah Alam' },
  ],
  qiraat: [],
  riwayat: [],
  tariq: [],
  institutions: [],
};

beforeEach(() => {
  Object.values(actions).forEach((f) => f.mockReset());
  push.mockReset();
  refresh.mockReset();
});

describe('PersonalForm (registration step 2)', () => {
  it('validates required fields in Bahasa Melayu without calling the server', async () => {
    const user = userEvent.setup();
    render(<PersonalForm teacher={null} reference={reference} piiEnabled nextHref="/teacher/register?langkah=3" />);
    await user.click(screen.getByRole('button', { name: 'Simpan & teruskan' }));
    expect(await screen.findByText('Nama penuh sekurang-kurangnya 3 aksara.')).toBeInTheDocument();
    expect(actions.savePersonalStepAction).not.toHaveBeenCalled();
  });

  it('saves and moves to the next step', async () => {
    actions.savePersonalStepAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<PersonalForm teacher={null} reference={reference} piiEnabled nextHref="/teacher/register?langkah=3" />);
    await user.type(screen.getByLabelText(/Nama penuh \(Rumi\)/), 'Ahmad bin Ali');
    await user.type(screen.getByLabelText(/Nama paparan awam/), 'Ustaz Ahmad');
    await user.click(screen.getByRole('button', { name: 'Simpan & teruskan' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/teacher/register?langkah=3'));
    expect(actions.savePersonalStepAction.mock.calls[0][0]).toMatchObject({ full_name_rumi: 'Ahmad bin Ali', public_display_name: 'Ustaz Ahmad' });
  });

  it('shows server field errors next to the field', async () => {
    actions.savePersonalStepAction.mockResolvedValue({ ok: false, fieldErrors: { ic_number: ['Penyimpanan No. MyKad belum diaktifkan.'] } });
    const user = userEvent.setup();
    render(<PersonalForm teacher={null} reference={reference} piiEnabled nextHref="/x" />);
    await user.type(screen.getByLabelText(/Nama penuh \(Rumi\)/), 'Ahmad bin Ali');
    await user.type(screen.getByLabelText(/Nama paparan awam/), 'Ustaz Ahmad');
    await user.click(screen.getByRole('button', { name: 'Simpan & teruskan' }));
    expect(await screen.findByText('Penyimpanan No. MyKad belum diaktifkan.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('filters districts by the chosen state', async () => {
    const user = userEvent.setup();
    render(<PersonalForm teacher={null} reference={reference} piiEnabled nextHref="/x" />);
    const district = screen.getByLabelText('Daerah kediaman');
    expect(district).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Negeri kediaman'), 's-kel');
    expect(district).toBeEnabled();
    const options = Array.from(district.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toContain('Kota Bharu');
    expect(options).not.toContain('Shah Alam');
  });

  it('disables the MyKad field when encryption is not configured', () => {
    render(<PersonalForm teacher={null} reference={reference} piiEnabled={false} nextHref="/x" />);
    expect(screen.getByLabelText('No. MyKad')).toBeDisabled();
  });
});

describe('VisibilityForm', () => {
  it('submits all eight booleans', async () => {
    actions.saveVisibilityAction.mockResolvedValue({ ok: true, message: 'Disimpan' });
    const user = userEvent.setup();
    render(<VisibilityForm settings={DEFAULT_SETTINGS} />);
    await user.click(screen.getByLabelText('Papar pendidikan'));
    await user.click(screen.getByRole('button', { name: 'Simpan' }));
    await waitFor(() => expect(actions.saveVisibilityAction).toHaveBeenCalled());
    expect(actions.saveVisibilityAction.mock.calls[0][0]).toEqual({ ...DEFAULT_SETTINGS, show_education: false });
  });
});

describe('SubmitPanel (step 7)', () => {
  it('requires the declaration and complete data', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SubmitPanel missing={['qiraat utama']} alreadySubmitted={false} />);
    expect(screen.getByText(/Lengkapkan: qiraat utama/)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/maklumat ini benar/));
    expect(screen.getByRole('button', { name: /Hantar untuk pengesahan/ })).toBeDisabled();

    rerender(<SubmitPanel missing={[]} alreadySubmitted={false} />);
    expect(screen.getByRole('button', { name: /Hantar untuk pengesahan/ })).toBeEnabled();
    actions.submitProfileAction.mockResolvedValue({ ok: true, message: 'Profil dihantar untuk pengesahan.' });
    await user.type(screen.getByLabelText(/Catatan kepada pentadbir/), 'Terima kasih');
    await user.click(screen.getByRole('button', { name: /Hantar untuk pengesahan/ }));
    await waitFor(() => expect(actions.submitProfileAction).toHaveBeenCalledWith('Terima kasih'));
    expect(await screen.findByText('Profil dihantar untuk pengesahan.')).toBeInTheDocument();
  });

  it('offers withdrawal once submitted', async () => {
    actions.withdrawSubmissionAction.mockResolvedValue({ ok: true, message: 'Ditarik balik' });
    const user = userEvent.setup();
    render(<SubmitPanel missing={[]} alreadySubmitted />);
    await user.click(screen.getByRole('button', { name: /Tarik balik/ }));
    await waitFor(() => expect(actions.withdrawSubmissionAction).toHaveBeenCalled());
  });
});

describe('EducationManager', () => {
  it('opens the form when empty and validates before saving', async () => {
    const user = userEvent.setup();
    render(<EducationManager items={[]} />);
    await user.click(screen.getByRole('button', { name: 'Tambah rekod' }));
    expect(await screen.findByText('Nama institusi sekurang-kurangnya 3 aksara.')).toBeInTheDocument();
    expect(actions.saveEducationAction).not.toHaveBeenCalled();
  });

  it('confirms before deleting', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <EducationManager
        items={[{ id: 'e1', institution_name: 'Uni Ujian', country: 'Malaysia', qualification_level: 'Diploma', field_of_study: 'Qiraat', start_year: null, graduation_year: 2010, is_public: true, verification_status: 'approved' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Padam Uni Ujian' }));
    expect(confirm).toHaveBeenCalled();
    expect(actions.deleteEducationAction).not.toHaveBeenCalled();
    expect(screen.getByText('Diluluskan')).toBeInTheDocument();
  });
});

describe('WizardStepper', () => {
  it('links only to steps already reached and marks the current one', () => {
    render(<WizardStepper current={3} reached={4} />);
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/teacher/register?langkah=2', '/teacher/register?langkah=4']);
    expect(screen.getByText('Pendidikan').closest('[aria-current="step"]')).not.toBeNull();
  });
});
