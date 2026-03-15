function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
          <div className="text-lg font-semibold tracking-tight">Roastlogs</div>
          <button
            type="button"
            className="rounded-full border border-zinc-800/80 bg-zinc-900/60 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900"
          >
            New
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-24 pt-6">
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-5">
          <div className="text-sm text-zinc-300">Tailwind check</div>
          <div className="mt-2 text-2xl font-semibold">Dark theme is rendering</div>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            If you can see the dark background, rounded card, and the bottom tabs, Tailwind CSS is
            being applied correctly.
          </p>
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-800/60 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2 px-3 py-3">
          <button
            type="button"
            className="rounded-xl bg-zinc-900/70 px-3 py-2 text-sm font-medium text-zinc-100"
          >
            Home
          </button>
          <button
            type="button"
            className="rounded-xl px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900/50"
          >
            Logs
          </button>
          <button
            type="button"
            className="rounded-xl px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900/50"
          >
            Settings
          </button>
        </div>
      </nav>
    </div>
  );
}

export default App;
