import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="font-display text-8xl font-extrabold text-gold">404</p>
        <p className="mt-2 font-display text-2xl font-bold">Page not found</p>
        <p className="text-muted">This page doesn't exist.</p>
        <Link to="/" className="btn btn-primary mt-6">
          Back home
        </Link>
      </div>
    </div>
  );
}
