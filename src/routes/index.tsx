import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    navigate({ to: user ? "/drive" : "/login", replace: true });
  }, [loading, navigate, user]);

  return (
    <div className="min-h-screen grid place-items-center bg-background text-muted-foreground text-sm">
      Chargement…
    </div>
  );
}
