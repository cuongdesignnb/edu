import {ActivityAccessPage} from '@/features/notebook/activity-access';
export default async function Page({params}:{params:Promise<{activityId:string}>}){return <ActivityAccessPage activityId={(await params).activityId}/>;}
