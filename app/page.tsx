"use client";

import {
  useRef,
  useState,
  useCallback,
  DragEvent,
  ChangeEvent,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoreBreakdown {
  clarity: number;
  impact: number;
  formatting: number;
  keywords: number;
  ats: number;
}

interface Improvement {
  number: number;
  title: string;
  before: string;
  after: string;
}

interface RoastResult {
  detectedRole: string;
  roleCategory: string;
  roast: string;
  score: { overall: number; breakdown: ScoreBreakdown };
  improvements: Improvement[];
  vibe: string;
}

type Status = "idle" | "extracting" | "roasting" | "done" | "error";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png";
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const SCORE_LABELS: Record<keyof ScoreBreakdown, string> = {
  clarity: "Clarity",
  impact: "Impact",
  formatting: "Formatting",
  keywords: "Keywords",
  ats: "ATS Compatibility",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function scoreColor(n: number): string {
  if (n <= 4) return "#ef4444";
  if (n <= 7) return "#eab308";
  return "#22c55e";
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = scoreColor(value);
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-sm font-bold" style={{ color }}>
          {value}/10
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${value * 10}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function ImprovementCard({ item }: { item: Improvement }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <p className="text-sm font-bold text-gray-800 mb-3">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#ff6b6b] text-white text-xs mr-2">
          {item.number}
        </span>
        {item.title}
      </p>
      <div className="grid sm:grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-red-50 border border-red-100 p-3">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1">Before</p>
          <p className="text-gray-700 leading-snug">{item.before}</p>
        </div>
        <div className="rounded-lg bg-green-50 border border-green-100 p-3">
          <p className="text-xs font-semibold text-green-500 uppercase tracking-wide mb-1">After</p>
          <p className="text-gray-700 leading-snug">{item.after}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results card (used for both fresh roasts and history detail)
// ---------------------------------------------------------------------------

function ResultsCard({
  result,
  fileName,
  primaryAction,
}: {
  result: RoastResult;
  fileName: string;
  primaryAction: { label: string; onClick: () => void };
}) {
  const overall = result.score.overall;
  return (
    <div className="flex flex-col min-h-screen bg-[#1a1a1a] px-4 py-10">
      <div className="mx-auto w-full max-w-2xl animate-fade-in">
        <div className="rounded-2xl bg-white shadow-2xl overflow-hidden">
          {/* Card header */}
          <div className="bg-[#1a1a1a] px-6 py-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-0.5">Roast complete</p>
              <p className="text-white font-semibold truncate max-w-xs">📄 {fileName}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-white/50 bg-white/10 rounded-full px-2.5 py-0.5">
                  {result.detectedRole}
                </span>
                <span className="text-xs text-white/30 bg-white/5 rounded-full px-2.5 py-0.5">
                  {result.roleCategory}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/40 mb-0.5">Overall Score</p>
              <p className="text-3xl font-extrabold" style={{ color: scoreColor(overall) }}>
                {overall}<span className="text-lg text-white/30">/10</span>
              </p>
            </div>
          </div>

          <div className="px-6 py-6 space-y-8">
            {/* Roast */}
            <div className="animate-fade-in">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">🔥 The Roast</p>
              <p className="text-lg font-bold text-[#ff6b6b] leading-snug">
                &ldquo;{result.roast}&rdquo;
              </p>
            </div>

            {/* Score breakdown */}
            <div className="animate-fade-in-delay">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">📊 Score Breakdown</p>
              <div className="space-y-3">
                {(Object.entries(result.score.breakdown) as [keyof ScoreBreakdown, number][]).map(
                  ([key, value]) => <ScoreBar key={key} label={SCORE_LABELS[key]} value={value} />
                )}
              </div>
            </div>

            {/* Improvements */}
            <div className="animate-fade-in-delay">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">✏️ Top 5 Improvements</p>
              <div className="space-y-3">
                {result.improvements.map((item) => <ImprovementCard key={item.number} item={item} />)}
              </div>
            </div>

            {/* Vibe */}
            <div className="animate-fade-in-delay rounded-xl bg-[#fff8f8] border border-[#ff6b6b]/20 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#ff6b6b] mb-1">💬 Overall Vibe</p>
              <p className="text-gray-700 italic leading-relaxed">&ldquo;{result.vibe}&rdquo;</p>
            </div>
          </div>

          {/* Primary action */}
          <div className="px-6 pb-6">
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="w-full rounded-full border-2 border-[#ff6b6b] py-3 text-sm font-bold text-[#ff6b6b] transition-colors hover:bg-[#ff6b6b] hover:text-white active:scale-95"
            >
              {primaryAction.label}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/25">
          Made with <span className="text-[#ff6b6b]">Claude Code</span>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading screen
// ---------------------------------------------------------------------------

function LoadingView({ status }: { status: "extracting" | "roasting" }) {
  return (
    <div className="flex flex-col min-h-screen bg-[#1a1a1a] items-center justify-center gap-5 px-6">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-3 h-3 rounded-full bg-[#ff6b6b]"
            style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
      <p className="text-white text-lg font-medium">
        {status === "extracting" ? "Extracting text from your resume…" : "Roasting your resume…"}
      </p>
      {status === "roasting" && (
        <p className="text-white/40 text-sm">Preparing brutal honesty. This takes a few seconds.</p>
      )}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(0.7); opacity: 0.4; }
          50% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [apiError, setApiError] = useState<string | null>(null);
  const [result, setResult] = useState<RoastResult | null>(null);
  // --- File validation ---
  function validateAndSetFile(candidate: File) {
    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      setValidationError("Only PDF, JPG, and PNG files are accepted.");
      return;
    }
    if (candidate.size > MAX_SIZE_BYTES) {
      setValidationError(`File is too large (${formatBytes(candidate.size)}). Max size is 10 MB.`);
      return;
    }
    setValidationError(null);
    setFile(candidate);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  }

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSetFile(dropped);
  }, []);

  function handleClear() {
    setFile(null);
    setValidationError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  // --- Roast flow ---
  async function handleRoast() {
    if (!file) return;
    setApiError(null);

    try {
      setStatus("extracting");
      const formData = new FormData();
      formData.append("file", file);

      const extractRes = await fetch("/api/extract", { method: "POST", body: formData });
      const extractData = await extractRes.json();
      if (!extractRes.ok) throw new Error(extractData.error ?? "Failed to extract text from file.");

      setStatus("roasting");
      const roastRes = await fetch("/api/roast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: extractData.text }),
      });
      const roastData = await roastRes.json();
      if (!roastRes.ok) throw new Error(roastData.error ?? "Roast failed. Please try again.");

      setResult(roastData);
      setStatus("done");
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  function handleRoastAnother() {
    setFile(null);
    setResult(null);
    setStatus("idle");
    setApiError(null);
    setValidationError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  // --- Render states ---

  if (status === "extracting" || status === "roasting") {
    return <LoadingView status={status} />;
  }

  if (status === "done" && result) {
    return (
      <ResultsCard
        result={result}
        fileName={file?.name ?? "resume"}
        primaryAction={{ label: "🔄 Roast Another Resume", onClick: handleRoastAnother }}
      />
    );
  }

  // --- Upload UI ---
  return (
    <div className="flex flex-col min-h-screen bg-[#1a1a1a] text-white font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          <span className="text-xl font-bold tracking-tight">ResumeRoaster</span>
        </div>
        <p className="text-sm text-white/50 hidden sm:block">Get Roasted. Get Better.</p>
      </header>

      {/* Main */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        {/* Hero */}
        <div className="text-center max-w-2xl mb-12">
          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight mb-4">
            Your Resume Deserves{" "}
            <span className="text-[#ff6b6b]">Brutal Honesty</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/60">
            Upload it. Get roasted. Actually improve.
          </p>
        </div>

        <div className="w-full max-w-lg">
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload resume"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={[
              "relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-8 py-12 cursor-pointer transition-colors duration-200 select-none",
              isDragging
                ? "border-[#ff6b6b] bg-[#ff6b6b]/10"
                : file
                ? "border-[#ff6b6b]/60 bg-[#ff6b6b]/5"
                : "border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/[0.08]",
            ].join(" ")}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="sr-only"
              onChange={handleInputChange}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="text-4xl">{file.type === "application/pdf" ? "📄" : "🖼️"}</span>
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium text-white break-all">{file.name}</span>
                  <button
                    type="button"
                    aria-label="Remove file"
                    onClick={(e) => { e.stopPropagation(); handleClear(); }}
                    className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-white/20 hover:bg-[#ff6b6b] transition-colors text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>
                <span className="text-sm text-white/40">{formatBytes(file.size)}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center pointer-events-none">
                <span className="text-4xl">⬆️</span>
                <p className="text-base font-medium text-white/80">
                  Drag your resume here or{" "}
                  <span className="text-[#ff6b6b] underline underline-offset-2">click to upload</span>
                </p>
                <p className="text-sm text-white/40">PDF, JPG, PNG · Max 10 MB</p>
              </div>
            )}
          </div>

          {validationError && (
            <p className="mt-3 text-sm text-[#ff6b6b] text-center">{validationError}</p>
          )}

          {status === "error" && apiError && (
            <div className="mt-4 rounded-xl bg-red-950/40 border border-red-800/50 px-4 py-3 text-sm text-red-300 text-center">
              {apiError}
            </div>
          )}

          <button
            type="button"
            disabled={!file}
            onClick={handleRoast}
            className={[
              "mt-6 w-full rounded-full py-4 text-base font-bold tracking-wide transition-all duration-200",
              file
                ? "bg-[#ff6b6b] text-white hover:bg-[#ff4f4f] active:scale-95 shadow-lg shadow-[#ff6b6b]/30"
                : "bg-white/10 text-white/30 cursor-not-allowed",
            ].join(" ")}
          >
            🔥 Roast My Resume
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-white/30 border-t border-white/10">
        Made with <span className="text-[#ff6b6b]">Claude Code</span>
      </footer>
    </div>
  );
}
