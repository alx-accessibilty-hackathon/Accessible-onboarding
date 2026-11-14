import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

interface DialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called when the dialog should close (Escape, backdrop click, close button). */
  onClose: () => void;
  /** Accessible dialog title. */
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Modal dialog using the native `<dialog>` element.
 * Focus is trapped while open; focus returns to the opener on close.
 */
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<Element | null>(null);

  // Open / close the native dialog and manage focus restoration.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    if (open && !el.open) {
      // Find the active element inside shadow root or document
      const rootNode = el.getRootNode();
      const shadowActive = rootNode instanceof ShadowRoot ? rootNode.activeElement : null;
      openerRef.current = shadowActive ?? document.activeElement;
      el.showModal();
    } else if (!open && el.open) {
      el.close();
      // Return focus to the element that opened the dialog.
      if (openerRef.current instanceof HTMLElement) {
        openerRef.current.focus();
      }
      openerRef.current = null;
    }
  }, [open]);

  // Handle backdrop clicks using native event listener to satisfy jsx-a11y
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    const handleBackdropClick = (e: MouseEvent) => {
      if (e.target === el) {
        onClose();
      }
    };

    el.addEventListener('click', handleBackdropClick);
    return () => {
      el.removeEventListener('click', handleBackdropClick);
    };
  }, [onClose]);

  // Handle native cancel event (Escape key).
  const handleCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>) => {
      e.preventDefault();
      onClose();
    },
    [onClose],
  );

  const cls = className ? `bo-dialog ${className}` : 'bo-dialog';

  return (
    <dialog ref={dialogRef} className={cls} onCancel={handleCancel} aria-label={title}>
      <div className="bo-dialog-header">
        <h2 className="bo-dialog-title">{title}</h2>
        <button type="button" className="bo-dialog-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="bo-dialog-body">{children}</div>
    </dialog>
  );
}
