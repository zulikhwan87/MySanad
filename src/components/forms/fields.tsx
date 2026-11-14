import * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const controlClass =
  'w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive';

function Help({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <p id={`${id}-error`} className="text-xs font-medium text-destructive">
        {error}
      </p>
    );
  }
  return hint ? (
    <p id={`${id}-hint`} className="text-xs text-muted-foreground">
      {hint}
    </p>
  ) : null;
}

const describedBy = (id: string, error?: string, hint?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

interface Base {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
}

function FieldLabel({ id, label, required }: { id: string; label: string; required?: boolean }) {
  return (
    <Label htmlFor={id}>
      {label}
      {required ? (
        <span className="text-destructive" aria-hidden>
          {' '}
          *
        </span>
      ) : null}
    </Label>
  );
}

export const TextField = React.forwardRef<HTMLInputElement, Base & React.InputHTMLAttributes<HTMLInputElement>>(
  ({ id, label, error, hint, required, className, ...props }, ref) => (
    <div className={cn('space-y-1.5', className)}>
      <FieldLabel id={id} label={label} required={required} />
      <input
        id={id}
        ref={ref}
        aria-invalid={Boolean(error)}
        aria-required={required}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(controlClass, 'h-10 py-2')}
        {...props}
      />
      <Help id={id} error={error} hint={hint} />
    </div>
  ),
);
TextField.displayName = 'TextField';

export const TextareaField = React.forwardRef<HTMLTextAreaElement, Base & React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ id, label, error, hint, required, className, rows = 4, ...props }, ref) => (
    <div className={cn('space-y-1.5', className)}>
      <FieldLabel id={id} label={label} required={required} />
      <textarea
        id={id}
        ref={ref}
        rows={rows}
        aria-invalid={Boolean(error)}
        aria-required={required}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(controlClass, 'py-2 leading-relaxed')}
        {...props}
      />
      <Help id={id} error={error} hint={hint} />
    </div>
  ),
);
TextareaField.displayName = 'TextareaField';

export interface Option {
  value: string;
  label: string;
}

export const SelectField = React.forwardRef<
  HTMLSelectElement,
  Base & React.SelectHTMLAttributes<HTMLSelectElement> & { options: Option[]; placeholder?: string }
>(({ id, label, error, hint, required, className, options, placeholder = 'Pilih…', ...props }, ref) => (
  <div className={cn('space-y-1.5', className)}>
    <FieldLabel id={id} label={label} required={required} />
    <select
      id={id}
      ref={ref}
      aria-invalid={Boolean(error)}
      aria-required={required}
      aria-describedby={describedBy(id, error, hint)}
      className={cn(controlClass, 'h-10')}
      {...props}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
    <Help id={id} error={error} hint={hint} />
  </div>
));
SelectField.displayName = 'SelectField';

export const CheckboxField = React.forwardRef<
  HTMLInputElement,
  Omit<Base, 'required'> & React.InputHTMLAttributes<HTMLInputElement> & { description?: string }
>(({ id, label, description, error, className, ...props }, ref) => (
  <div className={cn('flex items-start gap-3 rounded-xl border p-3', className)}>
    <input
      id={id}
      ref={ref}
      type="checkbox"
      aria-describedby={description ? `${id}-desc` : undefined}
      className="mt-0.5 size-4 shrink-0 accent-[hsl(var(--primary))]"
      {...props}
    />
    <div className="space-y-0.5">
      <Label htmlFor={id}>{label}</Label>
      {description ? (
        <p id={`${id}-desc`} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  </div>
));
CheckboxField.displayName = 'CheckboxField';
