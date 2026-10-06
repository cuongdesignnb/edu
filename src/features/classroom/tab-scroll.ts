export interface HorizontalTab {left:number;width:number}
/** Change only the horizontal position. Never scroll the page or another ancestor. */
export function visibleTabScroll(scrollLeft:number,clientWidth:number,scrollWidth:number,active:HorizontalTab|null){
 const max=Math.max(0,scrollWidth-clientWidth),saved=Math.max(0,Math.min(scrollLeft,max));
 if(!active||clientWidth<=0)return saved;
 if(active.left>=saved&&active.left+active.width<=saved+clientWidth)return saved;
 return Math.max(0,Math.min(active.left+(active.width-clientWidth)/2,max));
}
