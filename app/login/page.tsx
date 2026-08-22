export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center">
      <form
        method="post"
        action="/api/login"
        className="w-80 rounded-lg border border-border bg-card p-6"
      >
        <h1 className="font-mono text-sm text-foreground">wzrd.tech admin</h1>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          Operator dashboard — password required.
        </p>
        {error ? (
          <p className="mt-3 font-mono text-[11px] text-red-400">
            Wrong password.
          </p>
        ) : null}
        <input
          type="password"
          name="password"
          autoFocus
          placeholder="password"
          className="mt-4 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="mt-3 w-full rounded-md bg-accent px-3 py-2 font-mono text-xs text-black"
        >
          Enter
        </button>
      </form>
    </main>
  );
}
