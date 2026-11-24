import { m } from 'motion/react';
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export default function Modal({ open, title, onClose, children, className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) onClose();
  };

  return (
    // ponytail: entry animation only; native dialog.close() hides instantly, so no exit animation
    <m.dialog
      ref={ref}
      className={['modal', className].filter(Boolean).join(' ')}
      onClose={onClose}
      onClick={handleBackdropClick}
      initial={false}
      animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 12, scale: 0.97 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className="modal-shell">
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Chiudi">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </m.dialog>
  );
}
