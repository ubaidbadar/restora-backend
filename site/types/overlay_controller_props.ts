import type { ReactNode } from 'react';
import type ShowTools from './show_tools';

type OverlayControllerProps<Props extends ShowTools> = Omit<Props, keyof ShowTools> & {
  component?: (tools: ShowTools) => ReactNode;
};

export type { OverlayControllerProps as default };
