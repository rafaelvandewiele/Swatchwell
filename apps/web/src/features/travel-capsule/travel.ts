import type { ClothingItem } from "@swatchwell/shared";
import { generateOutfits } from "@swatchwell/outfit-engine";
import type { ColorSeason } from "@swatchwell/color-engine";

export type TripType = "city" | "business" | "relaxing" | "outdoor";
export interface TripInput { destination:string; startDate:string; endDate:string; tripType:TripType; activities:string[]; dressCode:string; weather:string; }
export interface PackingEntry { itemId:string; packed:boolean; }
export interface TripDay { date:string; activity:string; itemIds:string[]; }
export interface ManualEssential { id:string; name:string; packed:boolean; }
export interface TravelPlan { id:string; input:TripInput; entries:PackingEntry[]; days:TripDay[]; essentials:ManualEssential[]; createdAt:string; updatedAt:string; }

export function inclusiveTripDays(start:string,end:string):string[] {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))return [];
 const [sy,sm,sd]=start.split("-").map(Number);const [ey,em,ed]=end.split("-").map(Number);
 const a=new Date(sy,sm-1,sd,12),b=new Date(ey,em-1,ed,12);
 if(a.getFullYear()!==sy||a.getMonth()!==sm-1||a.getDate()!==sd||b.getFullYear()!==ey||b.getMonth()!==em-1||b.getDate()!==ed||!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime())||b<a)return [];
 const result:string[]=[];const d=new Date(a);
 while(d<=b&&result.length<=31){result.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);d.setDate(d.getDate()+1);}
 return result;
}
export function validateTrip(input:TripInput):string|null {
 if(!input.destination.trim())return "Enter a destination.";
 const days=inclusiveTripDays(input.startDate,input.endDate);
 if(!days.length)return "Choose a valid departure and return date.";
 if(days.length>31)return "Trips can be planned for up to 31 days.";
 return null;
}
export function buildTripOutfits(wardrobe:ClothingItem[],input:TripInput,season?:ColorSeason):TripDay[] {
 const dates=inclusiveTripDays(input.startDate,input.endDate);
 const candidates=generateOutfits(wardrobe,{limit:50,...(season?{season}:{})});
 const unique=new Map<string,typeof candidates[number]>();
 for(const candidate of candidates){const key=candidate.items.map(x=>x.id).sort().join("|");if(key&&!unique.has(key))unique.set(key,candidate);}
 const pool=[...unique.values()];
 const usage=new Map<string,number>();let cursor=0;
 return dates.map((date,index)=>{
  const activity=input.activities[index%Math.max(1,input.activities.length)]??input.tripType;
  const ranked=pool.map((outfit)=>{const names=outfit.items.map(item=>item.name.toLowerCase()).join(" ");const categories=new Set(outfit.items.map(item=>item.category));let context=0;if(/Business meetings/.test(activity)||input.tripType==="business"){context+=(categories.has("shirt")||categories.has("polo")?3:0);context+=(/suit|blazer|formal|tailored|loafer|derby|oxford/.test(names)?4:0);}if(/Hiking/.test(activity)||input.tripType==="outdoor"){context+=(/hiking|trail|outdoor|walking|boot|sneaker/.test(names)?4:0);context+=(/formal|loafer|derby/.test(names)?-3:0);}if(/Beach/.test(activity)||input.tripType==="relaxing"){context+=(/linen|short|light|cotton|sandal/.test(names)?2:0);context+=(/wool|heavy|coat/.test(names)?-3:0);}if(input.dressCode==="Formal")context+=(/shirt|blazer|trouser|loafer|derby|oxford/.test(names)?4:-2);if(input.weather.trim()){const cold=/cold|snow|winter|[0-9]{1,2}°/.test(input.weather);const warm=/warm|hot|summer|2[5-9]°|3[0-9]°/.test(input.weather);context+=cold?(categories.has("sweater")?3:0)+(categories.has("jacket")?3:0):warm?(categories.has("sweater")?-2:0)+(categories.has("jacket")?-2:0):0;}return {outfit,score:outfit.score+context-outfit.items.reduce((n,item)=>n+(usage.get(item.id)??0)*7,0)};}).sort((a,b)=>b.score-a.score);
  const selected=ranked.find(x=>!x.outfit.items.every(item=>(usage.get(item.id)??0)>0))?.outfit??ranked[cursor++%Math.max(1,ranked.length)]?.outfit;
  if(!selected)return {date,activity,itemIds:[]};
  selected.items.forEach(item=>usage.set(item.id,(usage.get(item.id)??0)+1));
  return {date,activity,itemIds:selected.items.map(item=>item.id)};
 });
}
export function createTravelPlan(input:TripInput,wardrobe:ClothingItem[],season?:ColorSeason):TravelPlan {
 const days=buildTripOutfits(wardrobe,input,season);
 const ids=[...new Set(days.flatMap(day=>day.itemIds))];
 return {id:crypto.randomUUID(),input,days,entries:ids.map(itemId=>({itemId,packed:false})),essentials:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
}
export function reconcilePacking(plan:TravelPlan,days:TripDay[]):TravelPlan {
 const ids=[...new Set(days.flatMap(day=>day.itemIds))];
 const previous=new Map(plan.entries.map(entry=>[entry.itemId,entry.packed]));
 return {...plan,days,entries:ids.map(itemId=>({itemId,packed:previous.get(itemId)??false})),updatedAt:new Date().toISOString()};
}
