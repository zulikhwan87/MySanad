// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/admin/verification' }));
const actions = vi.hoisted(() => ({
  decideSubmissionAction: vi.fn(),
  startReviewAction: vi.fn(),
  setItemStatusAction: vi.fn(),
}));
vi.mock('@/lib/actions/admin-actions', () => actions);
const notif = vi.hoisted(() => ({ markNotificationReadAction: vi.fn(), markAllNotificationsReadAction: vi.fn(), deleteNotificationAction: vi.fn() }));
vi.mock('@/lib/actions/notification-actions', () => notif);

import { DecisionPanel } from '@/components/admin/decision-panel';
import { ItemStatusButtons } from '@/components/admin/item-status-buttons';
import { AdminNav } from '@/components/admin/admin-nav';
import { NotificationList } from '@/components/teacher/notification-list';

const SUB = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  Object.values(actions).forEach((f) => f.mockReset().mockResolvedValue({ ok: true, message: 'OK' }));
  Object.values(notif).forEach((f) => f.mockReset().mockResolvedValue({ ok: true }));
});

describe('DecisionPanel', () => {
  it('offers to start the review for submitted items', () => {
    render(<DecisionPanel submissionId={SUB} status="submitted" targetType="teacher_profile" />);
    fireEvent.click(screen.getByRole('button', { name: /Mula semak/ }));
    expect(actions.startReviewAction).toHaveBeenCalledWith(SUB);
  });

  it('requires feedback before rejecting', () => {
    render(<DecisionPanel submissionId={SUB} status="under_review" targetType="teacher_profile" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Tolak' }));
    expect(screen.getByRole('button', { name: /Rekod keputusan/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Ulasan kepada guru/), { target: { value: 'Maklumat tidak lengkap.' } });
    expect(screen.getByRole('button', { name: /Rekod keputusan/ })).toBeEnabled();
  });

  it('asks for confirmation before publishing and sends the checklist', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DecisionPanel submissionId={SUB} status="under_review" targetType="teacher_profile" />);
    fireEvent.click(screen.getByLabelText(/Identiti disahkan/));
    fireEvent.click(screen.getByRole('radio', { name: 'Luluskan & terbitkan' }));
    fireEvent.change(screen.getByLabelText(/Catatan dalaman/), { target: { value: 'nota' } });
    fireEvent.click(screen.getByRole('button', { name: /Rekod keputusan/ }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() =>
      expect(actions.decideSubmissionAction).toHaveBeenCalledWith({
        submission_id: SUB,
        decision: 'publish',
        public_feedback: '',
        internal_comment: 'nota',
        checklist: { identiti: true },
      }),
    );
  });

  it('does not offer "publish" for documents and is read-only once decided', () => {
    const { unmount } = render(<DecisionPanel submissionId={SUB} status="under_review" targetType="ijazah_document" />);
    expect(screen.queryByRole('radio', { name: 'Luluskan & terbitkan' })).toBeNull();
    unmount();
    render(<DecisionPanel submissionId={SUB} status="published" targetType="teacher_profile" />);
    expect(screen.getByText(/telah diputuskan/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rekod keputusan/ })).toBeNull();
  });
});

describe('ItemStatusButtons', () => {
  it('sends the item decision', async () => {
    const onDone = vi.fn();
    render(<ItemStatusButtons table="sanad_nodes" id={SUB} label="Syeikh" onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Minta pembetulan Syeikh' }));
    await waitFor(() => expect(actions.setItemStatusAction).toHaveBeenCalledWith({ table: 'sanad_nodes', id: SUB, status: 'revision_required' }));
    expect(onDone).toHaveBeenCalledWith('OK', true);
  });
});

describe('AdminNav', () => {
  it('hides Super Admin pages from verification admins', () => {
    const { unmount } = render(<AdminNav superAdmin={false} openCount={3} />);
    expect(screen.queryByRole('link', { name: /Pengguna/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Log Audit/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Barisan Semakan/ })).toHaveTextContent('3');
    unmount();
    render(<AdminNav superAdmin openCount={0} />);
    expect(screen.getByRole('link', { name: /Pengguna/ })).toBeInTheDocument();
  });
});

describe('NotificationList', () => {
  const items = [
    { id: 'a', notification_type: 'profile_published', title: 'Diterbitkan', message: 'Tahniah', action_url: '/teacher/dashboard', is_read: false, created_at: '2026-01-01T00:00:00Z' },
    { id: 'b', notification_type: 'verification_started', title: 'Semakan bermula', message: 'x', action_url: null, is_read: true, created_at: '2026-01-01T00:00:00Z' },
  ];
  it('marks one or all as read and deletes', async () => {
    render(<NotificationList items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /Tanda semua dibaca \(1\)/ }));
    await waitFor(() => expect(notif.markAllNotificationsReadAction).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Tanda dibaca: Diterbitkan' }));
    await waitFor(() => expect(notif.markNotificationReadAction).toHaveBeenCalledWith('a'));
    fireEvent.click(screen.getByRole('button', { name: 'Padam: Semakan bermula' }));
    await waitFor(() => expect(notif.deleteNotificationAction).toHaveBeenCalledWith('b'));
  });
});
