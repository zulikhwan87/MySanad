import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

export const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ id, label, error, hint, ...props }, ref) => {
    const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} ref={ref} aria-invalid={Boolean(error)} aria-describedby={describedBy} {...props} />
        {hint && !error ? (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={`${id}-error`} className="text-xs font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
FormField.displayName = 'FormField';
