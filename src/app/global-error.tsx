"use client";
import "@/styles/globals.css";

/** SY08 / ST28 — last-resort boundary (replaces the root layout). No stack trace, no data. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="vi">
      <body className="bg-app">
        <main className="flex min-h-dvh items-center justify-center p-4">
          <div className="card w-full max-w-lg p-8 text-center">
            <p className="text-[12.5px] font-semibold uppercase tracking-wider text-muted">EduManage — bản demo</p>
            <h1 className="mt-2 text-[26px] font-bold text-ink">Ứng dụng gặp lỗi</h1>
            <p className="mt-2 text-[14.5px] text-body">Đã có lỗi không mong muốn. Dữ liệu demo đã lưu trên trình duyệt không bị ảnh hưởng. Hãy thử tải lại.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-primary" onClick={() => reset()}>Thử lại</button>
              <a href="/" className="btn btn-secondary">Về trang chính</a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
