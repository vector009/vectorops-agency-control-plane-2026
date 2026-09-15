import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ClientPortal } from "./pages/ClientPortal";
import { Home, CommandCenter, LoginPanel } from "./pages/Home";
import NotFound from "./pages/NotFound";

function Router() {
  const [, navigate] = useLocation();
  const [loginMode, setLoginMode] = useState<"admin" | "client" | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLoginMode(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Switch>
        <Route path="/">
          <Home onAdmin={() => setLoginMode("admin")} onClient={() => setLoginMode("client")} />
        </Route>
        <Route path="/admin">
          <CommandCenter onLogout={() => { navigate("/"); setLoginMode(null); }} />
        </Route>
        <Route path="/portal/:slug" component={ClientPortal} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
      {loginMode === "admin" && <LoginPanel mode="admin" onClose={() => setLoginMode(null)} />}
      {loginMode === "client" && <LoginPanel mode="client" onClose={() => setLoginMode(null)} />}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" switchable>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </ThemeProvider>
  );
}
