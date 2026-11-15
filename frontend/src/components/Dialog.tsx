import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { useAutoRead } from '../a11y/modes';
import type { Part } from '../a11y/speaker';
import { ListenButton } from '../i18n/ReadAloud';
import { t } from '../i18n/t';
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
  /** The widget language: the close button is named in it. */
  lang?: string;
  /** What the dialog says: read when it opens (Read aloud mode) and by its Listen button. */
  readParts?: () => Part[];
}

/**
 * Modal dialog using the native `<dialog>` element.
 * Focus is trapped while open; focus returns to the opener on close.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  lang,
  readParts,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<Element | null>(null);
  const id = useId();

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

  // Read aloud mode: say what the dialog says when it opens (after focus moved into it).
  useAutoRead(open && readParts ? `dialog:${id}` : null, readParts ?? (() => []), lang ?? 'en');

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-2)' }}>
          {open && readParts && lang && <ListenButton lang={lang} parts={readParts} />}
          <button
            type="button"
            className="bo-dialog-close"
            onClick={onClose}
            aria-label={lang ? t(lang, 'common.close') : 'Close'}
          >
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div className="bo-dialog-body">{children}</div>
    </dialog>
  );
}
