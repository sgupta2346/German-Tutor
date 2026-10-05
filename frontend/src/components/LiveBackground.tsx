import { useEffect, useMemo } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

const GLYPHS = ["ä", "ö", "ü", "ß", "Hallo", "Danke", "ch", "Tschüss", "sch", "Guten Tag", "eu", "ei", "Bitte", "Ja", "z"];

const BLOBS = [
  { size: 46, x: 8, y: 6, depth: 26, duration: 22, alt: "#fbbf24" },
  { size: 40, x: 72, y: 2, depth: -34, duration: 26, alt: "#f472b6" },
  { size: 52, x: 60, y: 62, depth: 30, duration: 30, alt: "#38bdf8" },
  { size: 38, x: -6, y: 58, depth: -22, duration: 24, alt: "#2dd4bf" },
];

function Blob({ color, index, mx, my, still }: { color: string; index: number; mx: ReturnType<typeof useSpring>; my: ReturnType<typeof useSpring>; still: boolean }) {
  const b = BLOBS[index];
  const tx = useTransform(mx, (v) => v * b.depth);
  const ty = useTransform(my, (v) => v * b.depth);
  const fill = index === 0 ? color : b.alt;
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: `${b.size}vmax`,
        height: `${b.size}vmax`,
        left: `${b.x}%`,
        top: `${b.y}%`,
        x: tx,
        y: ty,
        opacity: "var(--blob-opacity)",
      }}
      animate={{
        background: `radial-gradient(circle at 50% 50%, ${fill} 0%, transparent 68%)`,
        ...(still ? {} : { scale: [1, 1.12, 0.96, 1], rotate: [0, 12, -8, 0] }),
      }}
      transition={{
        background: { duration: 1.2, ease: "easeInOut" },
        scale: { duration: b.duration, repeat: Infinity, ease: "easeInOut" },
        rotate: { duration: b.duration * 1.3, repeat: Infinity, ease: "easeInOut" },
      }}
    />
  );
}

export function LiveBackground({ color }: { color: string }) {
  const still = useReducedMotion() ?? false;
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const mx = useSpring(rawX, { stiffness: 40, damping: 18 });
  const my = useSpring(rawY, { stiffness: 40, damping: 18 });

  useEffect(() => {
    if (still) return;
    const onMove = (e: PointerEvent) => {
      rawX.set(e.clientX / window.innerWidth - 0.5);
      rawY.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [still, rawX, rawY]);

  const glyphs = useMemo(
    () =>
      GLYPHS.map((text, i) => ({
        text,
        left: (i * 37 + 11) % 100,
        top: (i * 53 + 7) % 100,
        size: text.length > 2 ? 1.1 + (i % 3) * 0.35 : 2.2 + (i % 4) * 0.8,
        duration: 16 + (i % 5) * 5,
        delay: -(i * 3.7),
        depth: (i % 2 ? 1 : -1) * (10 + (i % 4) * 6),
      })),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ background: "var(--bg)" }}>
      {BLOBS.map((_, i) => (
        <Blob key={i} index={i} color={color} mx={mx} my={my} still={still} />
      ))}
      {glyphs.map((g) => (
        <Glyph key={g.text} g={g} mx={mx} my={my} still={still} />
      ))}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 40%, transparent 40%, var(--vignette) 100%)" }} />
    </div>
  );
}

function Glyph({
  g,
  mx,
  my,
  still,
}: {
  g: { text: string; left: number; top: number; size: number; duration: number; delay: number; depth: number };
  mx: ReturnType<typeof useSpring>;
  my: ReturnType<typeof useSpring>;
  still: boolean;
}) {
  const tx = useTransform(mx, (v) => v * g.depth);
  const ty = useTransform(my, (v) => v * g.depth);
  return (
    <motion.span
      className="absolute font-display font-extrabold"
      style={{ left: `${g.left}%`, top: `${g.top}%`, fontSize: `${g.size}rem`, x: tx, y: ty, color: "var(--glyph)" }}
    >
      <motion.span
        className="block"
        animate={still ? {} : { y: [0, -28, 0], rotate: [0, 6, 0] }}
        transition={{ duration: g.duration, delay: g.delay, repeat: Infinity, ease: "easeInOut" }}
      >
        {g.text}
      </motion.span>
    </motion.span>
  );
}
