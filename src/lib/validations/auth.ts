import { z } from 'zod';

const email = z
  .string({ required_error: 'Emel diperlukan.' })
  .trim()
  .toLowerCase()
  .min(1, 'Emel diperlukan.')
  .max(254, 'Emel terlalu panjang.')
  .email('Alamat emel tidak sah.');

const newPassword = z
  .string({ required_error: 'Kata laluan diperlukan.' })
  .min(10, 'Kata laluan mesti sekurang-kurangnya 10 aksara.')
  .max(72, 'Kata laluan tidak boleh melebihi 72 aksara.')
  .regex(/[a-z]/i, 'Kata laluan mesti mengandungi huruf.')
  .regex(/\d/, 'Kata laluan mesti mengandungi nombor.');

export const LoginSchema = z.object({
  email,
  password: z.string().min(1, 'Kata laluan diperlukan.').max(72),
});

export const RegisterSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(3, 'Nama penuh sekurang-kurangnya 3 aksara.')
      .max(255, 'Nama terlalu panjang.'),
    email,
    password: newPassword,
    confirm_password: z.string(),
    accept_terms: z.literal(true, {
      errorMap: () => ({ message: 'Anda mesti bersetuju dengan Terma Penggunaan dan Dasar Privasi.' }),
    }),
  })
  .refine((v) => v.password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'Kata laluan tidak sepadan.',
  });

export const ForgotPasswordSchema = z.object({ email });

export const UpdatePasswordSchema = z
  .object({ password: newPassword, confirm_password: z.string() })
  .refine((v) => v.password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'Kata laluan tidak sepadan.',
  });

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type UpdatePasswordInput = z.infer<typeof UpdatePasswordSchema>;

export type FieldErrors = Partial<Record<string, string[]>>;
export interface ActionResult {
  ok: boolean;
  message?: string;
  fieldErrors?: FieldErrors;
}
