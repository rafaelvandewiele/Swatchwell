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
 if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(start)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(end))return [];
 const a=new Date(start+"T12:00:00"),b=new Date(end+"T12:00:00");
 if(!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime())||b<a)return [];
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
 const candidates=generateOutfits(wardrobe,{limit:100,...(season?{season}:{})});
 const unique=new Map<string,typeof candidates[number]>();
 for(const candidate of candidates){const key=candidate.items.map(x=>x.id).sort().join("|");if(key&&!unique.has(key))unique.set(key,candidate);}
 const pool=[...unique.values()];
 const usage=new Map<string,number>();let cursor=0;
 return dates.map((date,index)=>{
  const activity=input.activities[index%Math.max(1,input.activities.length)]??input.tripType;
  const ranked=pool.map((outfit)=>({outfit,score:outfit.score-outfit.items.reduce((n,item)=>n+(usage.get(item.id)??0)*7,0)+(input.dressCode==="Formal"&&outfit.items.some(i=>/shirt|blazer|trouser|loafer|derby/i.test(i.name))?5:0)})).sort((a,b)=>b.score-a.score);
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
