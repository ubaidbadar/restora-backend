import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type BaseSyntheticEvent } from 'react';
import { useForm, type FieldValues, type Resolver } from 'react-hook-form';
import type FormProps from '../../types/form_props';
import type FormStatus from '../../types/form_status';
import getErrorMessage from '../../utils/get_error_message';

export default function Form({ component, onSubmit, defaultValues, schema, ...props }: FormProps) {
  const { register, handleSubmit, formState, reset, setError, setValue, control } = useForm<FieldValues>({
    defaultValues,
    resolver: schema ? (zodResolver(schema) as Resolver<FieldValues>) : undefined,
  });
  const [status, setStatus] = useState<FormStatus>({});

  const submit = async (data: FieldValues) => {
    if (status.loading || !onSubmit) return;

    setStatus({ loading: true });
    try {
      await onSubmit({
        data,
        onSuccess: (message) => setStatus({ message }),
        onError: (error) => setStatus({ error: getErrorMessage(error) }),
        onReset: () => {
          reset();
          setStatus({});
        },
        setError: (name, message) => {
          setStatus({});
          setError(name, { message });
        },
      });
    } catch (err) {
      setStatus({ error: getErrorMessage(err) });
    }
  };

  const handleFormSubmit = (event?: BaseSyntheticEvent) => handleSubmit(submit)(event);

  return (
    <form {...props} onSubmit={handleFormSubmit}>
      {component({ register, errors: formState.errors, ...status, setValue, control, onSubmit: handleFormSubmit })}
    </form>
  );
}
