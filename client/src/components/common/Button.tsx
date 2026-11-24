import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg font-medium tracking-tight transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.99] select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground hover:opacity-90 shadow-sm border border-transparent font-semibold',
        accent:
          'bg-yellow-400 text-black hover:bg-yellow-300 font-bold border border-yellow-500/40 shadow-[0_1px_8px_rgba(250,204,21,0.25)] active:scale-[0.98]',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border font-medium',
        outline:
          'border border-border bg-card hover:bg-secondary text-foreground hover:border-muted-foreground/40',
        ghost: 'hover:bg-secondary text-muted-foreground hover:text-foreground',
        destructive:
          'bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-destructive-foreground',
        glow: 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm border border-transparent font-semibold',
      },
      size: {
        sm: 'h-8 px-3 text-xs gap-1.5',
        md: 'h-10 px-4 text-xs sm:text-sm gap-2',
        lg: 'h-11 px-6 text-sm gap-2 font-semibold',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
