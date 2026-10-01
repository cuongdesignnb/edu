"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { parentRepo, type RepoError } from "@/lib/repositories";
import { parentCredential,consumeParentCredential } from "@/lib/api/parent-credential";
import { clearParentSession } from '@/lib/api/parent-session';
import { unavailableReason } from "@/features/parent/shell";
import { Brand } from "@/components/layout/brand";
import {ErrorState} from "@/components/ui/states";

/**
 * PA01 — fragment credentials stay in this page's memory. No parent account.
 */
export function ParentAccessView({ slug }: { slug: string }) {
  const router = useRouter();
  const flight=useRef<{slug:string;attempt:number;promise:ReturnType<typeof parentRepo.open>}|null>(null);
  const [state, setState] = useState<"opening" | "done">("opening");
  const [error,setError]=useState<RepoError|null>(null),[attempt,setAttempt]=useState(0);

  useEffect(()=>{const changed=()=>{if(window.location.hash)setAttempt(n=>n+1);};window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[]);
  useEffect(() => {
    let alive=true;
    if(!flight.current||flight.current.slug!==slug||flight.current.attempt!==attempt){
      const token=parentCredential(slug);
      if(!token){clearParentSession();router.replace(`/p/${slug}/access-unavailable?reason=invalid`);return;}
      flight.current={slug,attempt,promise:parentRepo.open({token},slug)};
    }
    flight.current.promise.then(receipt=>{
      if(!alive)return;consumeParentCredential(slug);setState('done');router.replace(`/p/${slug}/${receipt.homeModule}`);
    },(e:RepoError)=>{
      if(!alive)return;const reason=unavailableReason(e);if(reason)router.replace(`/p/${slug}/access-unavailable?reason=${reason}`);else setError(e);
    });
    return()=>{alive=false;};
  }, [slug, router,attempt]);

  if(error)return <div className="flex min-h-dvh items-center justify-center bg-app p-4"><div className="card w-full max-w-lg p-6"><ErrorState error={error} onRetry={()=>{setError(null);setAttempt(n=>n+1);}} /></div></div>;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-app p-4">
      <div className="card w-full max-w-lg p-6 text-center sm:p-8" aria-live="polite" aria-busy={state === "opening"}>
        <div className="flex justify-center"><Brand /></div>
        <span className="icon-tile tone-blue mx-auto mt-6 !rounded-full" aria-hidden><Lock className="size-6" /></span>
        <h1 className="mt-3 text-[22px] font-bold text-ink">Đang mở thông tin…</h1>
        <p className="mt-1 flex items-center justify-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" aria-hidden />Đang kiểm tra đường dẫn riêng do nhà trường cấp</p>
        <div className="mt-6 rounded-xl border border-line bg-[#f7fbff] p-4 text-left text-[13.5px] text-body">
          <p className="flex items-center gap-2 font-semibold text-ink"><ShieldCheck className="size-4 text-primary" aria-hidden />Về đường dẫn riêng</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Link chỉ dành cho gia đình được nhà trường cấp, cho một học sinh và một năm học.</li>
            <li>Không cần tạo tài khoản hay đăng nhập. Trang chỉ xem thông tin đã được công bố.</li>
            <li>Vui lòng không chuyển tiếp link cho người khác. Nếu link bị lộ, hãy báo giáo viên chủ nhiệm để thu hồi và cấp lại.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
