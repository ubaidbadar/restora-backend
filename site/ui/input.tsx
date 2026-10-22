import type { InputHTMLAttributes } from 'react';
import formInputBaseClasses from '../utils/form_input_base_classes';
import FieldShell from './field_shell';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ className = '', label, error, required, ...props }: InputProps) {
  return (
    <FieldShell label={label} required={required} error={error}>
      <span className="relative block">
        <input className={`${formInputBaseClasses} ${className}`} required={required} {...props} aria-invalid={!!error} aria-required={required} />
      </span>
    </FieldShell>
  );
}
