import {decodeTimetableWorkbook} from './timetable-workbook';

onmessage=(event:MessageEvent<ArrayBuffer>)=>{
 try{postMessage({sheets:decodeTimetableWorkbook(event.data)});}
 catch(e){postMessage({error:e instanceof Error?e.message:'Không đọc được workbook'});}
};
