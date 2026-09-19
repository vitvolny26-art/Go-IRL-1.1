import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { resolveCityTelegramChatId, resolveCityTelegramPromotionsTopicId, resolveCityTelegramUsername } from "../../../api/_shared/telegram-city-publication-core.ts";
import { appendTelegramPostShareButton } from "../../../api/_shared/telegram-event-card.ts";
import { resolveTelegramUser, type TelegramCallbackUser } from "./activityJoinCallbackBase.ts";
import { sendCommunicationVerificationRequests } from "./communicationVerification.ts";

type TelegramApi = <T>(method: string, body?: Record<string, unknown>) => Promise<T>;
type UiLanguage = "ru"|"uk"|"cs"|"en"|"pl"|"sk";
type CallbackQuery = { id?:string; data?:string; from?:TelegramCallbackUser; message?:{chat?:{id?:number;type?:string};message_id?:number} };
const uuid="([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})";
const callbackPattern=new RegExp(`^(cpplan|cpunplan):${uuid}$`,"i");
const lang=(v:string|null|undefined):UiLanguage=>{const n=(v||"").toLowerCase();if(n.startsWith("uk"))return"uk";if(n.startsWith("cs"))return"cs";if(n.startsWith("en"))return"en";if(n.startsWith("pl"))return"pl";if(n.startsWith("sk"))return"sk";return"ru"};
const copy={
 ru:{details:"Подробнее",plan:"Хочу пойти",planned:"Запланировано",remove:"Убрать из запланированного",saved:"✅ Добавлено в Афиши → Запланировано",removed:"Убрано из Запланировано",failed:"Не удалось обновить Запланировано"},
 uk:{details:"Докладніше",plan:"Хочу піти",planned:"Заплановано",remove:"Прибрати із запланованого",saved:"✅ Додано в Афіші → Заплановано",removed:"Прибрано із Запланованого",failed:"Не вдалося оновити Заплановане"},
 cs:{details:"Podrobnosti",plan:"Chci jít",planned:"Naplánováno",remove:"Odebrat z plánů",saved:"✅ Přidáno do Afishi → Naplánováno",removed:"Odebráno z plánů",failed:"Plán se nepodařilo aktualizovat"},
 en:{details:"Details",plan:"Want to go",planned:"Planned",remove:"Remove from plans",saved:"✅ Added to Afishi → Planned",removed:"Removed from Planned",failed:"Could not update Planned"},
 pl:{details:"Szczegóły",plan:"Chcę iść",planned:"Zaplanowane",remove:"Usuń z planów",saved:"✅ Dodano do Afishi → Zaplanowane",removed:"Usunięto z Zaplanowanych",failed:"Nie udało się zaktualizować planu"},
 sk:{details:"Podrobnosti",plan:"Chcem ísť",planned:"Naplánované",remove:"Odobrať z plánov",saved:"✅ Pridané do Afishi → Naplánované",removed:"Odstránené z plánov",failed:"Plán sa nepodarilo aktualizovať"}
} as const;
const parse=(v:string|undefined)=>{const m=v?.match(callbackPattern);return m?{action:m[1].toLowerCase() as "cpplan"|"cpunplan",eventId:m[2].toLowerCase()}:null};
const detailsUrl=(canonicalSlug:string)=>`https://t.me/GOirl_bot?startapp=${encodeURIComponent(`city-poster-${canonicalSlug}`)}`;
const postUrl=(cityId:string|null|undefined,messageId:number)=>{const username=resolveCityTelegramUsername(cityId);return username?`https://t.me/${username}/${messageId}`:null};
const loadEvent=async(db:SupabaseClient,eventId:string,language:UiLanguage)=>{
 const e=await db.from("city_posters_events").select("id,city_id,canonical_slug,status,hero_media_url,organizer_name").eq("id",eventId).maybeSingle();if(e.error)throw e.error;if(!e.data)return null;
 const tr=await db.from("city_posters_event_translations").select("language,title,description").eq("event_id",eventId);if(tr.error)throw tr.error;
 const rows=(tr.data||[]) as Array<{language:string;title:string;description:string}>;const t=rows.find(x=>x.language===language)||rows.find(x=>x.language==="en")||rows.find(x=>x.language==="ru")||rows[0];
 const o=await db.from("city_posters_occurrences").select("starts_at,ends_at,timezone,occurrence_url,status").eq("event_id",eventId).in("status",["scheduled","postponed","rescheduled"]).gte("ends_at",new Date().toISOString()).order("starts_at",{ascending:true}).limit(1).maybeSingle();if(o.error)throw o.error;
 return {...e.data,title:t?.title||"GO IRL",description:t?.description||"",occurrence:o.data};
};
const keyboard=(eventId:string,detailsUrl:string,language:UiLanguage,planned:boolean)=>({inline_keyboard:[[
 {text:copy[language].details,url:detailsUrl},
 planned?{text:copy[language].remove,callback_data:`cpunplan:${eventId}`}:{text:copy[language].plan,callback_data:`cpplan:${eventId}`}
]]});
export async function publishCityPosterEvent({supabase,telegramApi,eventId,language="cs"}:{supabase:SupabaseClient;telegramApi:TelegramApi;eventId:string;language?:string}){
 const ui=lang(language), event=await loadEvent(supabase,eventId,ui);if(!event||event.status!=="published"||!event.occurrence)return{published:false,skipped:"inactive"} as const;
 const expiresAt=event.occurrence.ends_at||event.occurrence.starts_at;if(new Date(expiresAt).getTime()<=Date.now())return{published:false,skipped:"expired"} as const;
 const chatId=resolveCityTelegramChatId(event.city_id),messageThreadId=resolveCityTelegramPromotionsTopicId(event.city_id);if(!chatId||!messageThreadId)return{published:false,skipped:"city"} as const;
 const existing=await supabase.from("city_posters_telegram_publications").select("telegram_chat_id,telegram_message_id,deleted_at").eq("event_id",eventId).maybeSingle();if(existing.error)throw existing.error;
 if(existing.data&&!existing.data.deleted_at){const existingChatId=Number(existing.data.telegram_chat_id),existingMessageId=Number(existing.data.telegram_message_id),eventDetailsUrl=detailsUrl(event.canonical_slug),url=postUrl(event.city_id,existingMessageId);if(url){try{await telegramApi("editMessageReplyMarkup",{chat_id:existingChatId,message_id:existingMessageId,reply_markup:appendTelegramPostShareButton(keyboard(eventId,eventDetailsUrl,ui,false),ui,url)})}catch(error){const message=error instanceof Error?error.message:"";if(!message.includes("message is not modified"))throw error}}return{published:true,reused:true,repaired:Boolean(url),chatId:existingChatId,messageId:existingMessageId} as const;}
 const eventDetailsUrl=detailsUrl(event.canonical_slug);
 const caption=[event.title,event.description].filter(Boolean).join("\n\n");
 const reply_markup=keyboard(eventId,eventDetailsUrl,ui,false);
 const sent=event.hero_media_url
  ?await telegramApi<{message_id:number}>("sendPhoto",{chat_id:chatId,message_thread_id:messageThreadId,photo:event.hero_media_url,caption,reply_markup})
  :await telegramApi<{message_id:number}>("sendMessage",{chat_id:chatId,message_thread_id:messageThreadId,text:caption,reply_markup});
 if(!Number.isSafeInteger(sent.message_id)||sent.message_id<=0)throw new Error("city_poster_telegram_message_invalid");
 const url=postUrl(event.city_id,sent.message_id);
 if(url)await telegramApi("editMessageReplyMarkup",{chat_id:chatId,message_id:sent.message_id,reply_markup:appendTelegramPostShareButton(reply_markup,ui,url)});
 const saved=await supabase.from("city_posters_telegram_publications").upsert({event_id:eventId,city_id:event.city_id,telegram_chat_id:chatId,telegram_message_id:sent.message_id,language:ui,expires_at:expiresAt,published_at:new Date().toISOString(),updated_at:new Date().toISOString(),deleted_at:null,last_error:null},{onConflict:"event_id"});
 if(saved.error){try{await telegramApi("deleteMessage",{chat_id:chatId,message_id:sent.message_id})}catch{console.warn("city_poster_cleanup_failed")}throw saved.error}
 return{published:true,reused:false,chatId,messageId:sent.message_id,expiresAt} as const;
}
export async function handleCityPostersPlanCallback({supabase,telegramApi,callbackQuery}:{supabase:SupabaseClient;telegramApi:TelegramApi;callbackQuery:CallbackQuery}){
 const parsed=parse(callbackQuery.data);if(!parsed)return{handled:false} as const;const callbackId=callbackQuery.id,user=callbackQuery.from;if(!callbackId||!user)return{handled:true,rejected:"invalid_callback"} as const;
 try{
  const resolved=await resolveTelegramUser(supabase,user);if("rejected" in resolved)throw new Error("user_rejected");
  const ui=lang(resolved.languageCode),event=await loadEvent(supabase,parsed.eventId,ui);if(!event||!event.occurrence||event.status!=="published")throw new Error("event_inactive");
  const activeUntil=new Date(event.occurrence.ends_at||event.occurrence.starts_at).getTime();if(activeUntil<=Date.now())throw new Error("event_expired");
  if(parsed.action==="cpunplan"){const d=await supabase.from("city_posters_user_plans").delete().eq("user_key",resolved.userKey).eq("event_id",parsed.eventId);if(d.error)throw d.error}
  else {const u=await supabase.from("city_posters_user_plans").upsert({user_key:resolved.userKey,event_id:parsed.eventId,updated_at:new Date().toISOString()},{onConflict:"user_key,event_id"});if(u.error)throw u.error}
  const planned=parsed.action==="cpplan",msg=planned?copy[ui].saved:copy[ui].removed;await telegramApi("answerCallbackQuery",{callback_query_id:callbackId,text:msg});
  if(planned&&resolved.isNew){
   try{await sendCommunicationVerificationRequests({supabase,telegramApi,userKeys:[resolved.userKey]})}
   catch{console.warn("city_poster_communication_verification_failed")}
  }
  const chatId=callbackQuery.message?.chat?.id;if(Number.isSafeInteger(chatId)&&["group","supergroup"].includes(callbackQuery.message?.chat?.type||"")){
   const eventDetailsUrl=detailsUrl(event.canonical_slug);
   await telegramApi("sendMessage",{chat_id:chatId,text:msg,ephemeral_message_parameters:{receiver_user_id:Number(user.id),callback_query_id:callbackId,replace_callback_query_message:true},reply_markup:keyboard(parsed.eventId,eventDetailsUrl,ui,planned)});
  }
  return{handled:true,eventId:parsed.eventId,userKey:resolved.userKey,status:planned?"planned":"removed"} as const;
 }catch{try{await telegramApi("answerCallbackQuery",{callback_query_id:callbackId,text:copy[lang(user.language_code)].failed,show_alert:true})}catch{console.warn("city_poster_callback_answer_failed")}return{handled:true,rejected:"plan_failed"} as const}
}
export async function maintainExpiredCityPosterPublications({supabase,telegramApi,limit=100}:{supabase:SupabaseClient;telegramApi:TelegramApi;limit?:number}){
 const due=await supabase.from("city_posters_telegram_publications").select("event_id,telegram_chat_id,telegram_message_id").is("deleted_at",null).lte("expires_at",new Date().toISOString()).limit(Math.max(1,Math.min(limit,200)));if(due.error)throw due.error;
 let deleted=0,failed=0;for(const row of due.data||[]){try{await telegramApi("deleteMessage",{chat_id:Number(row.telegram_chat_id),message_id:Number(row.telegram_message_id)});const u=await supabase.from("city_posters_telegram_publications").update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:null}).eq("event_id",row.event_id);if(u.error)throw u.error;deleted++}catch(e){failed++;await supabase.from("city_posters_telegram_publications").update({updated_at:new Date().toISOString(),last_error:e instanceof Error?e.message.slice(0,500):"telegram_delete_failed"}).eq("event_id",row.event_id)}}
 return{checked:(due.data||[]).length,deleted,failed} as const;
}

export async function publishDueCityPosterEvents({supabase,telegramApi,limit=50}:{supabase:SupabaseClient;telegramApi:TelegramApi;limit?:number}){
 const bounded=Math.max(1,Math.min(limit,200)), now=new Date().toISOString();
 const occurrences=await supabase.from("city_posters_occurrences").select("event_id").in("status",["scheduled","postponed","rescheduled"]).gte("ends_at",now).order("starts_at",{ascending:true}).limit(bounded*3);if(occurrences.error)throw occurrences.error;
 const eventIds=[...new Set((occurrences.data||[]).map((row)=>String(row.event_id||"")).filter(Boolean))].slice(0,bounded);if(!eventIds.length)return{checked:0,published:0,reused:0,skipped:0,failed:0} as const;
 const events=await supabase.from("city_posters_events").select("id,status").in("id",eventIds).eq("status","published");if(events.error)throw events.error;
 let published=0,reused=0,skipped=0,failed=0;const failures:Array<{eventId:string;error:string}>=[];for(const event of events.data||[]){try{const result=await publishCityPosterEvent({supabase,telegramApi,eventId:String(event.id),language:"cs"});if(result.published){published++;if("reused" in result&&result.reused)reused++}else skipped++}catch(error){failed++;const message=(error instanceof Error?error.message:"unknown").slice(0,500);failures.push({eventId:String(event.id),error:message});console.warn("city_poster_autopublish_failed",String(event.id),message)}}
 return{checked:(events.data||[]).length,published,reused,skipped,failed,...(failures.length?{failures}: {})} as const;
}
