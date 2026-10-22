import type { DetailedHTMLProps, HTMLAttributes } from 'react';

export default function FieldError({ children, className = '', ...props }: DetailedHTMLProps<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement>) {
  if (!children) return null;
  return (
    <span className={`block text-sm font-semibold text-chili ${className}`} role="alert" {...props}>
      {children}
    </span>
  );
}
