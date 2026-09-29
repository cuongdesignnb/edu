import Link from "next/link";
import { clsx } from "clsx";

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="flex-none">
      <path d="M24 6 3 16l21 10 17-8.1V29h4V16L24 6Z" fill="#1680f5" />
      <path d="M11 22.5v8.2c0 3.6 5.9 7.3 13 7.3s13-3.7 13-7.3v-8.2L24 29l-13-6.5Z" fill="#0a72e6" />
      <path d="M11 30.7c0 3.6 5.9 7.3 13 7.3s13-3.7 13-7.3" fill="none" stroke="#9ccaff" strokeWidth="1.6" />
      <circle cx="43" cy="31" r="2.6" fill="#0659c2" />
    </svg>
  );
}

/** EduManage brand block used by every shell. */
export function Brand({ href = "/", compact, tagline = "Kết nối nhà trường - Kiến tạo tương lai", className }: { href?: string; compact?: boolean; tagline?: string; className?: string }) {
  return (
    <Link href={href} className={clsx("flex min-w-0 items-center gap-2.5 rounded-lg", className)} aria-label="EduManage — trang chính">
      <LogoMark size={compact ? 36 : 40} />
      {!compact && (
        <span className="min-w-0">
          <span className="block text-[22px] font-extrabold leading-none tracking-tight text-[#0b4fa8]">EduManage</span>
          <span className="mt-1 block whitespace-nowrap text-[10.5px] tracking-tight text-muted">{tagline}</span>
        </span>
      )}
    </Link>
  );
}
