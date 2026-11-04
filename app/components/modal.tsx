import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import Button from "./button";

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}
const Modal = ({ title, children, onClose }: ModalProps) => {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const overflow = document.body.style.overflow;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      className="border-line text-ink m-auto max-h-[90dvh] w-[min(92vw,760px)] overflow-auto overscroll-contain rounded-xl border bg-white p-6 shadow-xl backdrop:bg-stone-950/30"
    >
      <div className="sticky -top-6 z-10 -mx-6 -mt-6 mb-5 flex items-center justify-between gap-4 bg-white px-6 pt-6 pb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button aria-label="닫기" onClick={onClose} variant="ghost">
          ✕
        </Button>
      </div>
      {children}
    </dialog>
  );
};

export default Modal;
