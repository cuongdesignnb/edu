import {StudentEvidencePage} from '@/features/notebook/student-evidence';
export default async function Page({params}:{params:Promise<{publicClassSlug:string}>}){const p=await params;return <StudentEvidencePage slug={p.publicClassSlug}/>;}
