"use client";

import { useRef, useState, useCallback, DragEvent, ChangeEvent } from "react";

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png";
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validateAndSetFile(candidate: File) {
    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      setError("Only PDF, JPG, and PNG files are accepted.");
      return;
    }
    if (candidate.size > MAX_SIZE_BYTES) {
      setError(`File is too large (${formatBytes(candidate.size)}). Max size is 10 MB.`);
      return;
    }
    setError(null);
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
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleRoast() {
    if (!file) return;
    console.log("Roasting file:", file);
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#1a1a1a] text-white font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          <span className="text-xl font-bold tracking-tight">ResumeRoaster</span>
        </div>
        <p className="text-sm text-white/50 hidden sm:block">
          Get Roasted. Get Better.
        </p>
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

        {/* Upload card */}
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
                : "border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/8",
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
              /* File selected state */
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="text-4xl">
                  {file.type === "application/pdf" ? "📄" : "🖼️"}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium text-white break-all">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    aria-label="Remove file"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClear();
                    }}
                    className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-white/20 hover:bg-[#ff6b6b] transition-colors text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>
                <span className="text-sm text-white/40">{formatBytes(file.size)}</span>
              </div>
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center gap-3 text-center pointer-events-none">
                <span className="text-4xl">⬆️</span>
                <p className="text-base font-medium text-white/80">
                  Drag your resume here or{" "}
                  <span className="text-[#ff6b6b] underline underline-offset-2">
                    click to upload
                  </span>
                </p>
                <p className="text-sm text-white/40">PDF, JPG, PNG · Max 10 MB</p>
              </div>
            )}
          </div>

          {/* Error message */}
          {error && (
            <p className="mt-3 text-sm text-[#ff6b6b] text-center">{error}</p>
          )}

          {/* CTA button */}
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
        Made with{" "}
        <span className="text-[#ff6b6b]">Claude Code</span>
      </footer>
    </div>
  );
}
