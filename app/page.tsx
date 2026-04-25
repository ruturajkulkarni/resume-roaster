import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Resume Roaster 🔥
        </h1>
        <p className="mt-4 text-xl text-zinc-500 dark:text-zinc-400">
          Upload your resume and get brutally honest (and hilarious) feedback.
        </p>
        <div className="mt-8">
          <Link
            href="/upload"
            className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-8 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Roast My Resume
          </Link>
        </div>
      </div>
    </main>
  );
}
