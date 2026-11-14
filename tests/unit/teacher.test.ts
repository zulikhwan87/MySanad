import { afterEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptPii, encryptPii, isPiiEncryptionConfigured, maskIc } from '@/lib/crypto/pii';
import { detectImageKind, isValidPhotoPath } from '@/lib/files/image-signature';
import { clampStep, missingForSubmission, profileEditMode } from '@/lib/teacher/status';
import {
  ChangeRequestSchema,
  EducationSchema,
  IjazahSchema,
  PersonalStepSchema,
  TeachingStepSchema,
  diffForChangeRequest,
  normalizeMyKad,
  normalizeMyPhone,
} from '@/lib/validations/teacher';

const UUID = '11111111-1111-4111-8111-111111111111';
const originalKey = process.env.MYSANAD_PII_ENCRYPTION_KEY;
afterEach(() => {
  process.env.MYSANAD_PII_ENCRYPTION_KEY = originalKey;
});

describe('PII encryption (AES-256-GCM)', () => {
  it('round-trips and never stores plaintext', () => {
    process.env.MYSANAD_PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const stored = encryptPii('880101031234');
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain('880101031234');
    expect(decryptPii(stored)).toBe('880101031234');
    expect(encryptPii('880101031234')).not.toBe(stored); // random IV
  });

  it('detects tampering and wrong keys', () => {
    process.env.MYSANAD_PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const stored = encryptPii('880101031234');
    const parts = stored.split(':');
    const flipped = Buffer.from(parts[3], 'base64');
    flipped[0] ^= 1;
    expect(decryptPii([parts[0], parts[1], parts[2], flipped.toString('base64')].join(':'))).toBeNull();
    process.env.MYSANAD_PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    expect(decryptPii(stored)).toBeNull();
  });

  it('refuses to encrypt without a valid key', () => {
    delete process.env.MYSANAD_PII_ENCRYPTION_KEY;
    expect(isPiiEncryptionConfigured()).toBe(false);
    expect(() => encryptPii('x')).toThrow();
    process.env.MYSANAD_PII_ENCRYPTION_KEY = Buffer.from('short').toString('base64');
    expect(isPiiEncryptionConfigured()).toBe(false);
  });

  it('ignores legacy plaintext values', () => {
    process.env.MYSANAD_PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    expect(decryptPii('880101-03-1234')).toBeNull();
  });

  it('masks all but the last four digits', () => {
    expect(maskIc('880101031234')).toBe('******-**-1234');
    expect(maskIc(null)).toBeNull();
  });
});

describe('Malaysian identifiers', () => {
  it('validates MyKad numbers including the date part', () => {
    expect(normalizeMyKad('880101-03-1234')).toBe('880101031234');
    expect(normalizeMyKad('880229 03 1234')).toBe('880229031234');
    expect(normalizeMyKad('881301-03-1234')).toBeNull();
    expect(normalizeMyKad('880132-03-1234')).toBeNull();
    expect(normalizeMyKad('12345')).toBeNull();
  });

  it('normalises phone numbers to +60', () => {
    expect(normalizeMyPhone('012-345 6789')).toBe('+60123456789');
    expect(normalizeMyPhone('+60 3-1234 5678')).toBe('+60312345678');
    expect(normalizeMyPhone('12345')).toBeNull();
    expect(normalizeMyPhone('+44 20 7946 0958')).toBeNull();
  });
});

describe('step schemas', () => {
  const personal = { full_name_rumi: 'Ahmad bin Ali', public_display_name: 'Ustaz Ahmad', alternative_spellings: 'Ahmad, Ahmed, Ahmad' };

  it('accepts a minimal personal step and de-duplicates spellings', () => {
    const r = PersonalStepSchema.safeParse({ ...personal, ic_number: '', private_phone: '' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.alternative_spellings).toEqual(['Ahmad', 'Ahmed']);
      expect(r.data.ic_number).toBeUndefined();
    }
  });

  it('rejects a non-Arabic Arabic name and an invalid MyKad', () => {
    expect(PersonalStepSchema.safeParse({ ...personal, full_name_arabic: 'Ahmad' }).success).toBe(false);
    expect(PersonalStepSchema.safeParse({ ...personal, full_name_arabic: 'أحمد' }).success).toBe(true);
    expect(PersonalStepSchema.safeParse({ ...personal, ic_number: '881399-03-1234' }).success).toBe(false);
  });

  it('requires a category when proposing a new institution', () => {
    const base = { teaching_state_id: UUID, teaching_experience_years: '5', short_bio: 'x'.repeat(40), accepting_students: true };
    expect(TeachingStepSchema.safeParse(base).success).toBe(true);
    expect(TeachingStepSchema.safeParse({ ...base, new_institution_name: 'Maahad Baharu' }).success).toBe(false);
    expect(TeachingStepSchema.safeParse({ ...base, new_institution_name: 'Maahad Baharu', new_institution_category: 'Maahad Tahfiz' }).success).toBe(true);
    expect(TeachingStepSchema.safeParse({ ...base, short_bio: 'pendek' }).success).toBe(false);
  });

  it('checks education year order and ijazah dates', () => {
    const edu = { institution_name: 'Uni', country: 'Malaysia', qualification_level: 'Diploma', field_of_study: 'Qiraat' };
    expect(EducationSchema.safeParse({ ...edu, start_year: '2010', graduation_year: '2008' }).success).toBe(false);
    expect(EducationSchema.safeParse({ ...edu, start_year: '2008', graduation_year: '2010' }).success).toBe(true);
    const ij = { ijazah_title: 'Ijazah Hafs', granting_sheikh_rumi: 'Syeikh Ujian' };
    expect(IjazahSchema.safeParse({ ...ij, conferral_date: '2999-01-01' }).success).toBe(false);
    expect(IjazahSchema.safeParse({ ...ij, conferral_date: '2015-05-01' }).success).toBe(true);
  });

  it('never accepts protected fields in a change request', () => {
    const r = ChangeRequestSchema.safeParse({
      full_name_rumi: 'Ahmad bin Ali',
      public_display_name: 'Ustaz Ahmad',
      primary_qiraat_id: UUID,
      teaching_state_id: UUID,
      teaching_experience_years: 3,
      short_bio: 'x'.repeat(40),
      is_published: true,
      profile_verification_status: 'published',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty('is_published');
      expect(r.data).not.toHaveProperty('profile_verification_status');
    }
  });
});

describe('diffForChangeRequest', () => {
  it('keeps only changed whitelisted fields', () => {
    const current = { short_bio: 'lama', specializations: ['Tahsin'], public_display_name: 'A', primary_riwayat_id: null };
    const proposed = { short_bio: 'baharu', specializations: ['Tahsin'], public_display_name: 'A', primary_riwayat_id: null };
    expect(diffForChangeRequest(current, proposed)).toEqual({ short_bio: 'baharu' });
    expect(diffForChangeRequest(current, { ...proposed, short_bio: 'lama' })).toEqual({});
    expect(diffForChangeRequest(current, { specializations: ['Tahsin', 'Tahfiz'] })).toEqual({ specializations: ['Tahsin', 'Tahfiz'] });
  });
});

describe('status helpers', () => {
  it('maps statuses to edit modes like the database lock', () => {
    expect(profileEditMode('draft')).toBe('editable');
    expect(profileEditMode('submitted')).toBe('editable');
    expect(profileEditMode('revision_required')).toBe('editable');
    expect(profileEditMode('published')).toBe('change-request');
    expect(profileEditMode('approved')).toBe('change-request');
    expect(profileEditMode('under_review')).toBe('locked');
    expect(profileEditMode('suspended')).toBe('locked');
  });

  it('prevents skipping ahead in the wizard', () => {
    expect(clampStep('7', 3)).toBe(3);
    expect(clampStep('1', 5)).toBe(2);
    expect(clampStep(undefined, 4)).toBe(4);
    expect(clampStep('abc', 6)).toBe(6);
    expect(clampStep('5', 7)).toBe(5);
  });

  it('lists what is missing before submission', () => {
    expect(missingForSubmission({ hasTeacher: false })).toEqual(['profil guru']);
    expect(
      missingForSubmission({ hasTeacher: true, fullName: 'A', displayName: 'A', teachingStateId: UUID, primaryQiraatId: null, shortBio: 'pendek' }),
    ).toEqual(['qiraat utama', 'biografi ringkas']);
  });
});

describe('image checks', () => {
  it('identifies images by magic bytes', () => {
    expect(detectImageKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectImageKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(detectImageKind(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(detectImageKind(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(detectImageKind(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
  });

  it('only accepts photo paths inside the owner folder', () => {
    expect(isValidPhotoPath(`${UUID}/avatar-abcdef1234.jpg`, UUID)).toBe(true);
    expect(isValidPhotoPath(`22222222-2222-4222-8222-222222222222/avatar-abcdef1234.jpg`, UUID)).toBe(false);
    expect(isValidPhotoPath(`${UUID}/../x/avatar-abcdef1234.jpg`, UUID)).toBe(false);
    expect(isValidPhotoPath(`${UUID}/avatar-abcdef1234.svg`, UUID)).toBe(false);
  });
});
