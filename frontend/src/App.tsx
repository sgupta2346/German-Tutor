import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Onboarding } from "@/components/Onboarding";
import { AudioErrorToast } from "@/components/ui";
import Home from "@/pages/Home";

const Learn = lazy(() => import("@/pages/Learn"));
const LessonPlayer = lazy(() => import("@/pages/LessonPlayer"));
const Sounds = lazy(() => import("@/pages/Sounds"));
const Cards = lazy(() => import("@/pages/Cards"));
const CardSession = lazy(() => import("@/pages/CardSession"));
const Speak = lazy(() => import("@/pages/Speak"));
const Listen = lazy(() => import("@/pages/Listen"));
const Tutor = lazy(() => import("@/pages/Tutor"));
const Settings = lazy(() => import("@/pages/Settings"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const wrap = (el: React.ReactNode) => <Suspense fallback={<div className="min-h-[50vh]" />}>{el}</Suspense>;

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/learn", element: wrap(<Learn />) },
      { path: "/lesson/:id", element: wrap(<LessonPlayer />) },
      { path: "/sounds", element: wrap(<Sounds />) },
      { path: "/cards", element: wrap(<Cards />) },
      { path: "/cards/:deckId", element: wrap(<CardSession />) },
      { path: "/speak", element: wrap(<Speak />) },
      { path: "/listen", element: wrap(<Listen />) },
      { path: "/tutor", element: wrap(<Tutor />) },
      { path: "/settings", element: wrap(<Settings />) },
      { path: "*", element: wrap(<NotFound />) },
    ],
  },
]);

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Onboarding />
      <AudioErrorToast />
    </>
  );
}
