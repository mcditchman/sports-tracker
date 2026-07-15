export default function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-60 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-700">
      <p>{message}</p>
    </div>
  )
}
