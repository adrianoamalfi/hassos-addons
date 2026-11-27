import { Routes, Route, Link, useLocation } from "react-router-dom";
import { Monitor, LayoutGrid } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import DeviceDetail from "./pages/DeviceDetail";

export default function App() {
  const location = useLocation();
  const nav = [
    { to: "/", label: "Devices", icon: Monitor },
  ];

  return (
    <div className="dark min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="sticky top-0 z-50 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <LayoutGrid className="h-5 w-5 text-[hsl(var(--primary))]" />
            AWTRIX Manager
          </Link>
          <nav className="flex items-center gap-1">
            {nav.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  location.pathname === to
                    ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
                    : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/device/:host" element={<DeviceDetail />} />
        </Routes>
      </main>
    </div>
  );
}
