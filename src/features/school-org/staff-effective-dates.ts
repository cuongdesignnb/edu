import {announcementScheduledAt} from '@/lib/repositories/connected/announcement-clock';
/** One pair of school-local dates supplies both account grant and daily assignment. */
export function staffEffectiveDates(startsOn:string,endsOn:string,timezone:string){
 return {...(startsOn?{validFrom:announcementScheduledAt(timezone,startsOn,'00:00')}:{}),validUntil:endsOn?announcementScheduledAt(timezone,endsOn,'00:00'):null};
}
