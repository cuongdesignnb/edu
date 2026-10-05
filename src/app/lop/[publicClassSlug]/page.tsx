import {PublicClassPortal} from '@/features/public/class-portal';
export default async function Page({params}:{params:Promise<{publicClassSlug:string}>}){const {publicClassSlug}=await params;return <PublicClassPortal key={publicClassSlug} slug={publicClassSlug}/>;}
