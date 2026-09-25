import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { resolveCityTelegramChatId, resolveCityTelegramPromotionsTopicId, resolveCityTelegramTopicId, resolveCityTelegramTopicIdForKind, resolveCityTelegramUsername, type CityTelegramPublicationKind } from "../../../api/_shared/telegram-city-publication-core.ts";
import { appendTelegramPostShareButton } from "../../../api/_shared/telegram-event-card.ts";
import { resolveTelegramUser, type TelegramCallbackUser } from "./activityJoinCallbackBase.ts";
import { sendCommunicationVerificationRequests } from "./communicationVerification.ts";

type TelegramRequestBody = Record<string, unknown> | FormData;
type TelegramApi = <T>(method: string, body?: TelegramRequestBody) => Promise<T>;
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
const isTelegramMessageNotModified=(error:unknown)=>error instanceof Error&&/message is not modified/i.test(error.message);
const telegramDeleteTerminalPrefix="terminal_telegram_delete:";
const isTelegramDeleteTerminal=(error:unknown)=>error instanceof Error&&/message (?:can't be deleted|to delete not found)/i.test(error.message);
const cacheBustedMediaUrl=(url:string,version:string|null|undefined)=>{try{const parsed=new URL(url);parsed.searchParams.set("v",version||"1");return parsed.toString()}catch{return url}};
const telegramPhotoUpload=async(url:string,version:string)=>{
 const response=await fetch(cacheBustedMediaUrl(url,version),{cache:"no-store"});if(!response.ok)throw new Error(`city_poster_media_fetch_failed:${response.status}`);
 const contentType=(response.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();if(!contentType.startsWith("image/"))throw new Error("city_poster_media_type_invalid");
 const blob=await response.blob();if(blob.size<=0||blob.size>10*1024*1024)throw new Error("city_poster_media_size_invalid");
 const fallbackFilename=`city-poster.${contentType==="image/png"?"png":contentType==="image/webp"?"webp":"jpg"}`;
 let filename:string;try{const candidate=decodeURIComponent(new URL(url).pathname.split("/").pop()||"");filename=/\.(?:jpe?g|png|webp)$/i.test(candidate)?candidate:fallbackFilename}catch{filename=fallbackFilename}
 return{blob,filename};
};
const monthNames:Record<UiLanguage,string[]>={ru:["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"],uk:["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"],cs:["ledna","února","března","dubna","května","června","července","srpna","září","října","listopadu","prosince"],en:["January","February","March","April","May","June","July","August","September","October","November","December"],pl:["stycznia","lutego","marca","kwietnia","maja","czerwca","lipca","sierpnia","września","października","listopada","grudnia"],sk:["januára","februára","marca","apríla","mája","júna","júla","augusta","septembra","októbra","novembra","decembra"]};
const formatAllDayRange=(startsAt:string,endsAt:string,language:UiLanguage)=>{const start=new Date(startsAt),exclusiveEnd=new Date(endsAt),end=new Date(exclusiveEnd.getTime()-86400000);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime()))return"";const sd=start.getUTCDate(),ed=end.getUTCDate(),sm=start.getUTCMonth(),em=end.getUTCMonth();if(start.getUTCFullYear()===end.getUTCFullYear()&&sm===em)return`${sd===ed?sd:`${sd}–${ed}`} ${monthNames[language][sm]}`;return`${sd} ${monthNames[language][sm]} – ${ed} ${monthNames[language][em]}`};
const loadEvent=async(db:SupabaseClient,eventId:string,language:UiLanguage)=>{
 const e=await db.from("city_posters_events").select("id,city_id,canonical_slug,status,hero_media_url,organizer_name,metadata").eq("id",eventId).maybeSingle();if(e.error)throw e.error;if(!e.data)return null;
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
 const requestedUi=lang(language),isNocVedy2026=(canonicalSlug:string)=>canonicalSlug.startsWith("noc-vedy-2026-");
 const event=await loadEvent(supabase,eventId,requestedUi);if(!event||event.status!=="published"||!event.occurrence)return{published:false,skipped:"inactive"} as const;
 const ui:UiLanguage=isNocVedy2026(event.canonical_slug)?"ru":requestedUi;
 const expiresAt=event.occurrence.ends_at||event.occurrence.starts_at;if(new Date(expiresAt).getTime()<=Date.now())return{published:false,skipped:"expired"} as const;
 const chatId=resolveCityTelegramChatId(event.city_id);if(!chatId)return{published:false,skipped:"city"} as const;
 const metadata=event.metadata&&typeof event.metadata==="object"?event.metadata as Record<string,unknown>:{};
 const topicSetting=typeof metadata.telegram_topic_kind==="string"?metadata.telegram_topic_kind:"auto";
 const explicitTopic=["chat","music","culture","sport","outdoor","education","games","kids","festival"].includes(topicSetting)?topicSetting as CityTelegramPublicationKind:null;
 const messageThreadId=topicSetting==="promotions"
  ?resolveCityTelegramPromotionsTopicId(event.city_id)
  :explicitTopic?resolveCityTelegramTopicIdForKind(event.city_id,explicitTopic):resolveCityTelegramTopicId(event.city_id,{title_cs:event.title,description_cs:event.description});
 const existing=await supabase.from("city_posters_telegram_publications").select("telegram_chat_id,telegram_message_id,deleted_at").eq("event_id",eventId).maybeSingle();if(existing.error)throw existing.error;
 const eventDetailsUrl=detailsUrl(event.canonical_slug);
 const dateRange=formatAllDayRange(event.occurrence.starts_at,event.occurrence.ends_at,ui);
 const telegramText=typeof metadata.telegram_text==="string"?metadata.telegram_text.trim():"";
 const caption=telegramText||(isNocVedy2026(event.canonical_slug)
  ?["🔬 Noc vědy — ночь науки для всей семьи","25 сентября можно заглянуть в лаборатории, попробовать эксперименты и показать детям науку вживую.","🎟 Вход бесплатно","👉 Подробнее — площадки, время и полная программа в вашем городе."].join("\n\n")
  :[event.title,event.description,dateRange].filter(Boolean).join("\n\n"));
 const reply_markup=keyboard(eventId,eventDetailsUrl,ui,false);
 if(existing.data&&!existing.data.deleted_at){
  const existingChatId=Number(existing.data.telegram_chat_id),messageId=Number(existing.data.telegram_message_id),destinationChanged=existingChatId!==chatId,replacementChatId=destinationChanged?chatId:existingChatId;
  const refreshVersion=new Date().toISOString();
  if(event.hero_media_url){
   const upload=await telegramPhotoUpload(event.hero_media_url,refreshVersion),formData=new FormData();
   formData.set("chat_id",String(replacementChatId));formData.set("photo",upload.blob,upload.filename);formData.set("caption",caption);
   formData.set("reply_markup",JSON.stringify(reply_markup));if(messageThreadId)formData.set("message_thread_id",String(messageThreadId));
   const sent=await telegramApi<{message_id:number;photo?:Array<{file_id?:string;file_unique_id?:string}>}>("sendPhoto",formData);
   if(!Number.isSafeInteger(sent.message_id)||sent.message_id<=0)throw new Error("city_poster_telegram_message_invalid");
   const photoIdentity=Array.isArray(sent.photo)&&sent.photo.length?sent.photo[sent.photo.length-1]:null;
   if(!photoIdentity?.file_id||!photoIdentity.file_unique_id){
    try{await telegramApi("deleteMessage",{chat_id:replacementChatId,message_id:sent.message_id})}catch{console.warn("city_poster_replacement_cleanup_failed")}
    throw new Error("city_poster_telegram_photo_identity_missing");
   }
   try{
    const replacementUrl=postUrl(event.city_id,sent.message_id);
    if(replacementUrl)await telegramApi("editMessageReplyMarkup",{chat_id:replacementChatId,message_id:sent.message_id,reply_markup:appendTelegramPostShareButton(reply_markup,ui,replacementUrl)});
    const replaced=await supabase.from("city_posters_telegram_publications").update({telegram_chat_id:replacementChatId,telegram_message_id:sent.message_id,language:ui,expires_at:expiresAt,updated_at:refreshVersion,last_error:null}).eq("event_id",eventId).eq("telegram_message_id",messageId).select("event_id").maybeSingle();
    if(replaced.error)throw replaced.error;if(!replaced.data)throw new Error("city_poster_publication_state_changed");
    if(destinationChanged){
     try{await telegramApi("deleteMessage",{chat_id:existingChatId,message_id:messageId})}catch{console.warn("city_poster_old_destination_cleanup_failed")}
    }else{
     try{
      const deleted=await telegramApi<boolean>("deleteMessage",{chat_id:existingChatId,message_id:messageId});if(deleted!==true)throw new Error("city_poster_old_message_delete_failed");
     }catch(error){
      const detail=error instanceof Error?error.message.slice(0,500):"city_poster_old_message_delete_failed";
      const restored=await supabase.from("city_posters_telegram_publications").update({telegram_chat_id:existingChatId,telegram_message_id:messageId,updated_at:new Date().toISOString(),last_error:detail}).eq("event_id",eventId).eq("telegram_message_id",sent.message_id);if(restored.error)console.error("city_poster_replacement_ledger_restore_failed",restored.error);
      try{await telegramApi("deleteMessage",{chat_id:replacementChatId,message_id:sent.message_id})}catch{console.warn("city_poster_replacement_cleanup_failed")}
      throw error;
     }
    }
    return{published:true,reused:true,refreshed:true,replaced:true,photoIdentityVerified:true,chatId:replacementChatId,messageId:sent.message_id,oldMessageId:messageId} as const;
   }catch(error){
    const current=await supabase.from("city_posters_telegram_publications").select("telegram_message_id").eq("event_id",eventId).maybeSingle();
    if(!current.error&&Number(current.data?.telegram_message_id)===messageId){
     try{await telegramApi("deleteMessage",{chat_id:replacementChatId,message_id:sent.message_id})}catch{console.warn("city_poster_replacement_cleanup_failed")}
    }
    throw error;
   }
  }
  const url=postUrl(event.city_id,messageId),refreshedMarkup=url?appendTelegramPostShareButton(reply_markup,ui,url):reply_markup;
  if(destinationChanged){
   const moved=await telegramApi<{message_id:number}>("sendMessage",{chat_id:chatId,text:caption,reply_markup,...(messageThreadId?{message_thread_id:messageThreadId}:{})});
   if(!Number.isSafeInteger(moved.message_id)||moved.message_id<=0)throw new Error("city_poster_telegram_message_invalid");
   try{
    const movedUrl=postUrl(event.city_id,moved.message_id);
    if(movedUrl)await telegramApi("editMessageReplyMarkup",{chat_id:chatId,message_id:moved.message_id,reply_markup:appendTelegramPostShareButton(reply_markup,ui,movedUrl)});
    const migrated=await supabase.from("city_posters_telegram_publications").update({telegram_chat_id:chatId,telegram_message_id:moved.message_id,language:ui,expires_at:expiresAt,updated_at:refreshVersion,last_error:null}).eq("event_id",eventId).eq("telegram_message_id",messageId).select("event_id").maybeSingle();
    if(migrated.error)throw migrated.error;if(!migrated.data)throw new Error("city_poster_publication_state_changed");
   }catch(error){
    try{await telegramApi("deleteMessage",{chat_id:chatId,message_id:moved.message_id})}catch{console.warn("city_poster_replacement_cleanup_failed")}
    throw error;
   }
   try{await telegramApi("deleteMessage",{chat_id:existingChatId,message_id:messageId})}catch{console.warn("city_poster_old_destination_cleanup_failed")}
   return{published:true,reused:true,refreshed:true,replaced:true,chatId,messageId:moved.message_id,oldMessageId:messageId} as const;
  }
  let noop=false;try{await telegramApi("editMessageText",{chat_id:existingChatId,message_id:messageId,text:caption,reply_markup:refreshedMarkup})}catch(error){if(!isTelegramMessageNotModified(error))throw error;noop=true}
  const refreshed=await supabase.from("city_posters_telegram_publications").update({language:ui,expires_at:expiresAt,updated_at:refreshVersion,last_error:null}).eq("event_id",eventId);if(refreshed.error)throw refreshed.error;
  return{published:true,reused:true,refreshed:true,noop,chatId:existingChatId,messageId} as const;
 }
 const sent=event.hero_media_url
  ?await telegramApi<{message_id:number}>("sendPhoto",{chat_id:chatId,photo:event.hero_media_url,caption,reply_markup,...(messageThreadId?{message_thread_id:messageThreadId}:{})})
  :await telegramApi<{message_id:number}>("sendMessage",{chat_id:chatId,text:caption,reply_markup,...(messageThreadId?{message_thread_id:messageThreadId}:{})});
 if(!Number.isSafeInteger(sent.message_id)||sent.message_id<=0)throw new Error("city_poster_telegram_message_invalid");
 try{
  const saved=await supabase.from("city_posters_telegram_publications").upsert({event_id:eventId,city_id:event.city_id,telegram_chat_id:chatId,telegram_message_id:sent.message_id,language:ui,expires_at:expiresAt,published_at:new Date().toISOString(),updated_at:new Date().toISOString(),deleted_at:null,last_error:null},{onConflict:"event_id"});
  if(saved.error)throw saved.error;
  const url=postUrl(event.city_id,sent.message_id);
  if(url)await telegramApi("editMessageReplyMarkup",{chat_id:chatId,message_id:sent.message_id,reply_markup:appendTelegramPostShareButton(reply_markup,ui,url)});
 }catch(error){
  try{await telegramApi("deleteMessage",{chat_id:chatId,message_id:sent.message_id})}catch{console.warn("city_poster_cleanup_failed")}
  await supabase.from("city_posters_telegram_publications").update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:error instanceof Error?error.message.slice(0,500):"city_poster_publish_failed"}).eq("event_id",eventId).eq("telegram_message_id",sent.message_id);
  throw error;
 }
 return{published:true,reused:false,chatId,messageId:sent.message_id,expiresAt} as const;
}

export async function rollbackCityPosterPublication({supabase,telegramApi,eventId,chatId,messageId}:{supabase:SupabaseClient;telegramApi:TelegramApi;eventId:string;chatId:number;messageId:number}){
 await telegramApi("deleteMessage",{chat_id:chatId,message_id:messageId});
 const rolledBack=await supabase.from("city_posters_telegram_publications").update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:"exact_publish_batch_rolled_back"}).eq("event_id",eventId).eq("telegram_message_id",messageId);
 if(rolledBack.error)throw rolledBack.error;
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
 const due=await supabase.from("city_posters_telegram_publications").select("event_id,telegram_chat_id,telegram_message_id").is("deleted_at",null).lte("expires_at",new Date().toISOString()).or(`last_error.is.null,last_error.not.like.${telegramDeleteTerminalPrefix}%`).limit(Math.max(1,Math.min(limit,200)));if(due.error)throw due.error;
 let deleted=0,terminal=0,failed=0;for(const row of due.data||[]){try{await telegramApi("deleteMessage",{chat_id:Number(row.telegram_chat_id),message_id:Number(row.telegram_message_id)});const u=await supabase.from("city_posters_telegram_publications").update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:null}).eq("event_id",row.event_id);if(u.error)throw u.error;deleted++}catch(e){const now=new Date().toISOString(),message=e instanceof Error?e.message.slice(0,450):"telegram_delete_failed";if(isTelegramDeleteTerminal(e)){terminal++;const u=await supabase.from("city_posters_telegram_publications").update({updated_at:now,last_error:`${telegramDeleteTerminalPrefix}${message}`}).eq("event_id",row.event_id);if(u.error)throw u.error;continue}failed++;await supabase.from("city_posters_telegram_publications").update({updated_at:now,last_error:message}).eq("event_id",row.event_id)}}
 return{checked:(due.data||[]).length,deleted,terminal,failed} as const;
}

export async function publishDueCityPosterEvents({supabase,telegramApi,limit=50}:{supabase:SupabaseClient;telegramApi:TelegramApi;limit?:number}){
 const bounded=Math.max(1,Math.min(limit,200)), now=new Date().toISOString();
 const occurrences=await supabase.from("city_posters_occurrences").select("event_id").in("status",["scheduled","postponed","rescheduled"]).gte("ends_at",now).order("starts_at",{ascending:true}).limit(bounded*3);if(occurrences.error)throw occurrences.error;
 const eventIds=[...new Set((occurrences.data||[]).map((row)=>String(row.event_id||"")).filter(Boolean))].slice(0,bounded);if(!eventIds.length)return{checked:0,published:0,reused:0,skipped:0,failed:0} as const;
 const events=await supabase.from("city_posters_events").select("id,status").in("id",eventIds).eq("status","published");if(events.error)throw events.error;
 const activePublications=await supabase.from("city_posters_telegram_publications").select("event_id").in("event_id",eventIds).is("deleted_at",null);if(activePublications.error)throw activePublications.error;
 const activeEventIds=new Set((activePublications.data||[]).map((row)=>String(row.event_id||"")).filter(Boolean));
 let published=0,reused=0,skipped=0,failed=0;for(const event of events.data||[]){if(activeEventIds.has(String(event.id))){published++;reused++;continue}try{const result=await publishCityPosterEvent({supabase,telegramApi,eventId:String(event.id),language:"cs"});if(result.published){published++;if("reused" in result&&result.reused)reused++}else skipped++}catch(error){failed++;console.warn("city_poster_autopublish_failed",String(event.id),error instanceof Error?error.message:"unknown")}}
 return{checked:(events.data||[]).length,published,reused,skipped,failed} as const;
}
