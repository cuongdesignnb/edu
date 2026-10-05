/** Replace supported text variables; unknown variables remain editable text. */
export function fillMessageTemplate(template:string,values:Record<string,string>){
 return template.replace(/\{\{([a-z_]+)\}\}|\{([a-z_]+)\}/g,(whole,long:string,short:string)=>values[long||short]??whole);
}
