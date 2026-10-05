import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-[2rem] bg-surface p-6 pb-10 shadow-2xl md:inset-x-auto md:left-1/2 md:top-1/2 md:bottom-auto md:w-[640px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[2rem] md:p-8"
            initial={{ y: "100%", opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
          >
            <button aria-label="Close" onClick={onClose} className="absolute right-5 top-5 rounded-full p-2 text-muted hover:bg-raised hover:text-ink">
              <X size={20} />
            </button>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
