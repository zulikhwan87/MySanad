import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('relative w-full rounded-lg border p-4 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7', {
  variants: {
    variant: {
      default: 'bg-card text-foreground',
      info: 'border-forest-200 bg-forest-50 text-forest-800',
      success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
      destructive: 'border-red-200 bg-red-50 text-red-800',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Alert({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}
