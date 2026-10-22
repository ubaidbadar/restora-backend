import type { InputHTMLAttributes } from 'react';
import FieldError from './field_error';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
}

/** A box on the left, what ticking it means on the right. */
export default function Checkbox({ label, error, required, className = '', ...props }: CheckboxProps) {
  return (
    <span className="flex flex-col gap-1.5">
      <label className={`flex items-start gap-3 text-[0.95rem] ${className}`}>
        <input type="checkbox" required={required} className="mt-1 size-5 accent-indigo" {...props} aria-invalid={!!error} aria-required={required} />
        {label}
      </label>
      <FieldError>{error}</FieldError>
    </span>
  );
}
