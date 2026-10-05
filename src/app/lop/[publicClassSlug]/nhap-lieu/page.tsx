import {OfficerWorkspacePage} from '@/features/notebook/officer-workspace';
export default async function Page({params}:{params:Promise<{publicClassSlug:string}>}){const p=await params;return <OfficerWorkspacePage slug={p.publicClassSlug}/>;}
