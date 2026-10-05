import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { BookOpen, Flame, Headphones, Home, Layers, MessageCircle, Mic, Settings, Type } from "lucide-react";
import { currentStreak, useStore } from "@/lib/store";
import { forgetOldAudioCaches, preloadAudio } from "@/lib/audio";
import { LiveBackground } from "./LiveBackground";

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true, color: "#f59e0b" },
  { to: "/learn", label: "Learn", icon: BookOpen, color: "#3b82f6" },
  { to: "/tutor", label: "Tutor", icon: MessageCircle, color: "#ec4899" },
  { to: "/sounds", label: "Sounds", icon: Type, color: "#8b5cf6" },
  { to: "/cards", label: "Cards", icon: Layers, color: "#10b981" },
  { to: "/speak", label: "Speak", icon: Mic, color: "#f97316" },
  { to: "/listen", label: "Listen", icon: Headphones, color: "#06b6d4" },
];

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#15123a" : "#fbf7ff");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

function sectionColor(path: string): string {
  if (path.startsWith("/lesson")) return NAV[1].color;
  if (path.startsWith("/settings")) return "#6366f1";
  const hit = [...NAV].reverse().find((n) => (n.end ? path === n.to : path.startsWith(n.to)));
  return hit?.color ?? NAV[0].color;
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 items-end gap-[3px] rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 px-2 pb-2 pt-2 shadow-md">
        {[10, 18, 24, 14].map((h, i) => (
          <motion.span
            key={i}
            className={clsx("w-[4px] rounded-full", i % 2 ? "bg-white" : "bg-gold")}
            animate={{ height: [h * 0.5, h, h * 0.5] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ))}
      </div>
      <span className="font-display text-2xl font-extrabold tracking-tight">Klang</span>
    </div>
  );
}

export function AppShell() {
  useTheme();
  useEffect(() => {
    forgetOldAudioCaches();
    const t = window.setTimeout(() => preloadAudio(), 1500);
    return () => window.clearTimeout(t);
  }, []);
  const location = useLocation();
  const streak = useStore((s) => currentStreak(s.streak, s.lastActive));
  const immersive = location.pathname.startsWith("/lesson/") || /^\/cards\/.+/.test(location.pathname);

  return (
    <div className="grain relative isolate min-h-full">
      <LiveBackground color={sectionColor(location.pathname)} />
      {!immersive && (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/70 px-5 py-7 backdrop-blur-xl lg:flex">
          <Logo />
          <nav className="mt-10 flex flex-1 flex-col gap-1.5">
            {NAV.map(({ to, label, icon: Icon, end, color }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  clsx(
                    "group relative flex items-center gap-3 rounded-2xl px-4 py-3 font-semibold transition-colors",
                    isActive ? "text-ink" : "text-muted hover:bg-raised hover:text-ink",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-2xl" style={{ background: `${color}22`, boxShadow: `inset 3px 0 0 ${color}` }} transition={{ type: "spring", stiffness: 400, damping: 34 }} />
                    )}
                    <Icon size={20} className="relative" style={{ color: isActive ? color : undefined }} />
                    <span className="relative">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-full bg-raised px-3 py-1.5 text-sm font-bold">
              <Flame size={16} className={streak ? "text-ember" : "text-muted"} />
              {streak} day{streak === 1 ? "" : "s"}
            </div>
            <NavLink to="/settings" aria-label="Settings" className="rounded-full p-2 text-muted hover:bg-raised hover:text-ink">
              <Settings size={20} />
            </NavLink>
          </div>
        </aside>
      )}

      {!immersive && (
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/80 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Logo />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1 text-sm font-bold">
              <Flame size={15} className={streak ? "text-ember" : "text-muted"} />
              {streak}
            </div>
            <NavLink to="/settings" aria-label="Settings" className="rounded-full p-2 text-muted">
              <Settings size={20} />
            </NavLink>
          </div>
        </header>
      )}

      <main className={clsx(!immersive && "lg:pl-64")}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className={clsx(!immersive && "mx-auto max-w-6xl px-4 pb-32 pt-6 md:px-8 lg:pb-16 lg:pt-12")}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {!immersive && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex max-w-md justify-between">
            {NAV.map(({ to, label, icon: Icon, end, color }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  clsx("relative flex min-w-0 flex-1 flex-col items-center gap-1 py-1.5 text-[10px] font-semibold", isActive ? "text-ink" : "text-muted")
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="tab-pill" className="absolute top-0 h-8 w-11 rounded-full" style={{ background: `${color}2e` }} />}
                    <Icon size={21} className="relative mt-1" style={{ color: isActive ? color : undefined }} />
                    <span className="relative">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
