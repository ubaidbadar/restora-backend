import type { DetailedHTMLProps, LabelHTMLAttributes } from 'react';
import FieldError from './field_error';

interface FieldShellProps extends DetailedHTMLProps<LabelHTMLAttributes<HTMLLabelElement>, HTMLLabelElement> {
  label?: string;
  required?: boolean;
  error?: string;
}

export default function FieldShell({ label, required, error, children, className = '', ...props }: FieldShellProps) {
  return (
    <label className={`flex flex-col gap-1.5 text-[0.95rem] font-semibold text-ink ${className}`} {...props}>
      {label && (
        <span>
          {label}
          {required && <span className="text-chili"> *</span>}
        </span>
      )}
      {children}
      <FieldError>{error}</FieldError>
    </label>
  );
}
