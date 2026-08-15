// Plain HTML form (no client JS needed) — POST-only so the browser's
// SameSite=Lax cookie handling actually protects it from cross-site
// triggering, unlike a GET link would.
export function SignOutForm() {
  return (
    <form action="/api/auth/federated-signout" method="post">
      <button
        type="submit"
        className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Sign out
      </button>
    </form>
  );
}
