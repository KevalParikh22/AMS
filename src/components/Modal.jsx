import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Shared overlay for every popup in the app.
 *
 * Rendered through a portal into document.body so it can never be trapped by an
 * ancestor that establishes a containing block for fixed positioning (a lingering
 * `transform`, a `filter`, or `.glass-panel`'s `backdrop-filter`). Inside a view
 * tree a `position: fixed` backdrop would otherwise resolve against that ancestor
 * and get clipped by the scrolling content wrapper in Layout.
 *
 * variant="dialog" — centered panel that scrolls when it outgrows the viewport.
 * variant="sheet"  — full-bleed opaque surface that owns its own scrolling.
 */
export default function Modal({
  open,
  onClose,
  children,
  maxWidth = '520px',
  variant = 'dialog',
  className = '',
  style,
  zIndex = 'var(--z-modal)',
  closeOnBackdrop = true,
  closeOnEscape = true,
}) {
  const dismissible = Boolean(onClose);

  // Escape to close.
  useEffect(() => {
    if (!open || !dismissible || !closeOnEscape) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, dismissible, closeOnEscape, onClose]);

  // Freeze the page behind the overlay so scroll gestures land on the panel.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = (e) => {
    // Ignore clicks that bubbled up from the panel itself.
    if (closeOnBackdrop && dismissible && e.target === e.currentTarget) onClose();
  };

  if (variant === 'sheet') {
    return createPortal(
      <div
        className={className}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'var(--bg-primary)',
          zIndex,
          overflowY: 'auto',
          padding: '1.5rem',
          ...style,
        }}
      >
        {children}
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex,
        // The backdrop is the scroll container. `justify-content: center` plus
        // `margin: auto` on the panel centers it when it fits and keeps every edge
        // reachable when it doesn't — `align-items: center` would strand the top.
        display: 'flex',
        justifyContent: 'center',
        overflowY: 'auto',
        padding: '2rem 1rem',
      }}
    >
      <div
        className={`card glass-panel ${className}`.trim()}
        style={{
          width: '100%',
          maxWidth,
          margin: 'auto',
          maxHeight: 'calc(100dvh - 4rem)',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-color)',
          animation: 'modalIn 0.2s ease-out',
          ...style,
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
