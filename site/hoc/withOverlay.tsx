import { useState, type ComponentType } from 'react';
import type OverlayControllerProps from '../types/overlay_controller_props';
import type ShowTools from '../types/show_tools';

/** Turns a panel into a self-managing overlay: owns the open state, renders the trigger, and mounts the panel while open. */
export default function withOverlay<Props extends ShowTools>(Panel: ComponentType<Props>) {
  function Overlay({ component, ...panelProps }: OverlayControllerProps<Props>) {
    const [state, setState] = useState<ShowTools['state']>('');
    const tools: ShowTools = { state, open: () => setState('active'), close: () => setState('') };

    return (
      <>
        {component?.(tools)}
        {state && <Panel {...(panelProps as unknown as Props)} {...tools} />}
      </>
    );
  }

  Overlay.displayName = `withOverlay(${Panel.displayName || Panel.name || 'Panel'})`;
  return Overlay;
}
