import {RepoError} from '../errors';
export function announcementClock(timezone:string,iso:string){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)),pick=(key:string)=>parts.find(p=>p.type===key)!.value;return {date:`${pick('year')}-${pick('month')}-${pick('day')}`,time:`${pick('hour')}:${pick('minute')}`};
}
export function announcementScheduledAt(timezone:string,date:string,time:string){
 const wall=`${date}T${time}:00Z`,target=Date.parse(wall);if(!Number.isFinite(target)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time))throw new RepoError('VALIDATION','Ngày hoặc giờ công bố không hợp lệ.');
 let instant=target;for(let i=0;i<3;i++){const local=announcementClock(timezone,new Date(instant).toISOString()),offset=Date.parse(`${local.date}T${local.time}:00Z`)-instant;instant=target-offset;}
 const actual=announcementClock(timezone,new Date(instant).toISOString());if(actual.date!==date||actual.time!==time)throw new RepoError('VALIDATION','Thời điểm này không tồn tại trong múi giờ của trường.');return new Date(instant).toISOString();
}
