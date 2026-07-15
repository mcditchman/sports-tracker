'use client'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">Something went wrong loading the data</h1>
      <p className="text-sm text-zinc-500">
        The stats database may be temporarily unavailable. Your last results are still valid —
        try again in a moment.
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
      >
        Try again
      </button>
    </main>
  )
}
