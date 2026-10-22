import type { ElementType } from 'react';
import buttonSizes from '../constants/button_sizes';
import buttonVariants from '../constants/button_variants';
import type ButtonProps from '../types/button_props';

const baseClasses = 'inline-flex items-center justify-center rounded-control font-semibold transition-[background-color,color,filter]';

/** A button, or a link that looks like one (`as="a"`). WhatsApp links pass `target="_blank"` themselves. */
export default function Button<T extends ElementType = 'button'>({ as, variant = 'primary', size = 'md', className = '', ...props }: ButtonProps<T>) {
  const Component: ElementType = as || 'button';
  return <Component className={`${baseClasses} ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`} {...props} />;
}
