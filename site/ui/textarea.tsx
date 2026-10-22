import type { TextareaHTMLAttributes } from 'react';
import formInputBaseClasses from '../utils/form_input_base_classes';
import FieldShell from './field_shell';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export default function Textarea({ className = '', label, error, required, ...props }: TextareaProps) {
  return (
    <FieldShell label={label} required={required} error={error}>
      <textarea className={`${formInputBaseClasses} py-3 ${className}`} required={required} {...props} aria-invalid={!!error} aria-required={required} />
    </FieldShell>
  );
}
