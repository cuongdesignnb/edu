import { clsx } from "clsx";
import { initials } from "@/lib/formatters";

const TONES: Record<string, string> = {
  blue: "bg-[#dcebff] text-[#0b58b8]", green: "bg-[#d9f3e8] text-[#067a53]", amber: "bg-[#ffecc7] text-[#8a4b00]",
  pink: "bg-[#fde0e6] text-[#b0213f]", purple: "bg-[#e9e2ff] text-[#5433b8]",
};

/** C030 — consistent initials avatar (no external avatar service, no real photos). */
export function Avatar({ name, tone = "blue", size = 36, className, square }: { name: string; tone?: string; size?: number; className?: string; square?: boolean }) {
  return (
    <span className={clsx("inline-flex flex-none select-none items-center justify-center font-bold", square ? "rounded-xl" : "rounded-full", TONES[tone] ?? TONES.blue, className)}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Identity({ name, sub, tone, size = 36, className }: { name: string; sub?: string; tone?: string; size?: number; className?: string }) {
  return (
    <span className={clsx("flex min-w-0 items-center gap-2.5", className)}>
      <Avatar name={name} tone={tone} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink">{name}</span>
        {sub && <span className="block truncate text-[12px] text-muted">{sub}</span>}
      </span>
    </span>
  );
}

export function SchoolMark({ name, color = "#0a72e6", size = 32 }: { name: string; color?: string; size?: number }) {
  const words = name.replace(/^Trường\s+/i, "").split(/\s+/);
  const letters = (words[words.length - 2]?.[0] ?? "") + (words[words.length - 1]?.[0] ?? "");
  return (
    <span className="inline-flex flex-none items-center justify-center rounded-lg font-extrabold text-white" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }} aria-hidden>
      {letters.toUpperCase()}
    </span>
  );
}
