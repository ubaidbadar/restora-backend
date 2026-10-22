import type { BaseSyntheticEvent } from 'react';
import type { Control, FieldErrors, FieldValues, UseFormRegister, UseFormSetValue } from 'react-hook-form';
import type FormStatus from './form_status';

export default interface FormComponentProps extends FormStatus {
  register: UseFormRegister<FieldValues>;
  errors: FieldErrors<FieldValues>;
  setValue: UseFormSetValue<FieldValues>;
  control: Control<FieldValues>;
  onSubmit: (e?: BaseSyntheticEvent) => Promise<void>;
}
