import { createHash } from "node:crypto";
import type { CinemaAdapter, CinemaFetchedPage, CinemaNormalizedScreening, CinemaParseResult, CinemaRawSnapshotPayload } from "../cinema-ingestion-types.js";

const timeoutMs = 20_000;
const userAgent = "GO-IRL-Cinema-Ingestion/2.0 (+official Picturehouse)";
const hash = (value:string) => createHash("sha256").update(value).digest("hex");
const decode = (value:string) => value.replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'");
const strip = (html:string) => decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();
const meta = (html:string,name:string) => new RegExp(`<meta\\b[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`,"i").exec(html)?.[1]||null;
const absolute = (value:string|null|undefined,base:string) => { try { return value?new URL(decode(value),base).toString():null; } catch { return null; } };
const slug = (value:string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const movieIdFromUrl = (url:string) => /\/movie-details\/\d+\/([^/?#]+)/i.exec(new URL(url).pathname)?.[1]||null;

const fetchPage = async (url:string, init:RequestInit={}):Promise<CinemaFetchedPage> => {
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{...init,redirect:"follow",signal:controller.signal,headers:{"user-agent":userAgent,accept:"text/html,application/json",...(init.headers||{})}});
    const body=await response.text(); if(!response.ok)throw new Error(`http_${response.status}`); if(!body.trim())throw new Error("empty_body");
    return {url:response.url||url,status:response.status,body};
  }finally{clearTimeout(timer);}
};

const localDate = (iso:string,tz:string) => {
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(iso)).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const addDays = (date:string,days:number) => { const value=new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate()+days); return value.toISOString().slice(0,10); };
const offsetMs = (date:Date,tz:string) => {
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date).map(part=>[part.type,part.value]));
  return Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second)-date.getTime();
};
const toIso = (local:string,tz:string) => {
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00$/.exec(local); if(!match)throw new Error("invalid_local_datetime");
  const guess=Date.UTC(+match[1],+match[2]-1,+match[3],+match[4],+match[5]); let utc=guess-offsetMs(new Date(guess),tz); const corrected=offsetMs(new Date(utc),tz); if(corrected!==offsetMs(new Date(guess),tz))utc=guess-corrected; return new Date(utc).toISOString();
};

type PicturehouseShowtime = { SessionId?:string|number; Showtime?:string; date_f?:string; time?:string; ScreenName?:string; SessionAttributesNames?:unknown[]; attributes?:unknown[] };
type PicturehouseMovie = { ScheduledFilmId?:string; Title?:string; CinemaId?:string; image_url?:string; show_times?:PicturehouseShowtime[] };
type PicturehousePayload = { response?:string; movies?:PicturehouseMovie[] };
type MovieDetails = { description:string|null; poster:string|null; director:string|null; actors:string[]; releaseYear:number|null; age:string|null; duration:number|null; genres:string[] };

const detailValue = (html:string,label:string) => {
  const match=new RegExp(`<li[^>]*>\\s*${label}\\s*:?\\s*</li>\\s*<li[^>]*>([\\s\\S]*?)</li>`,"i").exec(html);
  return match?strip(match[1]):null;
};
const parseDetails = (page:CinemaFetchedPage):MovieDetails => {
  const release=detailValue(page.body,"Release Date");
  const duration=/(?:Duration|Running Time|Runtime)[^\d]{0,80}(\d{2,3})/i.exec(strip(page.body))?.[1]||null;
  return {
    description:meta(page.body,"og:description")||meta(page.body,"description"),
    poster:absolute(meta(page.body,"og:image"),page.url),
    director:detailValue(page.body,"Director"),
    actors:(detailValue(page.body,"Starring")||"").split(/\s*,\s*/).filter(Boolean).slice(0,12),
    releaseYear:release?+(release.match(/\b(19\d{2}|20\d{2})\b/)?.[1]||0)||null:null,
    age:detailValue(page.body,"Certificate"),
    duration:duration?+duration:null,
    genres:(detailValue(page.body,"Genre")||"").split(/\s*[,/|]\s*/).filter(Boolean),
  };
};

const parseSchedule = (source:Parameters<CinemaAdapter["parseSnapshot"]>[0],page:CinemaFetchedPage,detailById:Map<string,MovieDetails>) => {
  const rows:CinemaNormalizedScreening[]=[]; const errors:string[]=[];
  let payload:PicturehousePayload; try{payload=JSON.parse(page.body) as PicturehousePayload;}catch{return {rows,errors:["schedule_json_invalid"]};}
  if(payload.response!=="success"||!Array.isArray(payload.movies))return {rows,errors:["schedule_payload_invalid"]};
  for(const movie of payload.movies){
    const movieId=String(movie.ScheduledFilmId||"").trim(),title=String(movie.Title||"").trim();
    if(!movieId||!title){errors.push("movie_identity_missing");continue;}
    const cinemaId=String(movie.CinemaId||source.config?.cinema_id||"004").padStart(3,"0");
    const detailUrl=new URL(`/movie-details/${cinemaId}/${movieId}/${slug(title)}`,source.source_url).toString();
    const detail=detailById.get(movieId)||null;
    for(const showtime of movie.show_times||[]){
      const date=String(showtime.date_f||""); const time=String(showtime.time||"").padStart(5,"0");
      const local=/^\d{4}-\d{2}-\d{2}$/.test(date)&&/^\d{2}:\d{2}$/.test(time)?`${date}T${time}:00`:null;
      if(!local){errors.push(`showtime_invalid:${movieId}:${showtime.SessionId??"unknown"}`);continue;}
      try{
        const session=String(showtime.SessionId||"").trim()||null;
        const attributes=[...(showtime.SessionAttributesNames||[]),...(showtime.attributes||[])].map(String);
        const stable=session?`${source.source_id}:${session}`:[source.source_id,source.venue_id,movieId,local].join("|");
        rows.push({external_screening_id:session,screening_fingerprint:`sha256:${hash(stable)}`,external_movie_id:movieId,movie_fingerprint:`${source.source_id}:${movieId}:${detail?.releaseYear??"unknown"}`,title,original_title:null,release_year:detail?.releaseYear||null,duration_minutes:detail?.duration||null,poster_url:detail?.poster||absolute(movie.image_url,source.source_url),genres:detail?.genres||[],countries:[],original_language:"en",age_rating:detail?.age||null,description:detail?.description||null,director:detail?.director||null,lead_actors:detail?.actors||[],starts_at_local:local,starts_at:toIso(local,source.timezone),timezone:source.timezone,audio_language:"en",subtitle_languages:[],audio_type:null,version_type:null,format:attributes.find(value=>/^(2D|3D|IMAX)$/i.test(value))?.toUpperCase()||null,auditorium:showtime.ScreenName||null,screening_tags:[...new Set(attributes)],ticket_url:null,source_url:detailUrl,raw_language:"English",raw_version:attributes.join(" ")||null});
      }catch(error){errors.push(`showtime_parse_failed:${movieId}:${error instanceof Error?error.message:"unknown"}`);}
    }
  }
  return {rows,errors};
};

export const picturehouseUkAdapter:CinemaAdapter={
  key:"picturehouse_uk",
  async fetchSnapshot(source):Promise<CinemaRawSnapshotPayload>{
    const fetched_at=new Date().toISOString(),pages:CinemaFetchedPage[]=[],failures:CinemaRawSnapshotPayload["failures"]=[];
    try{
      const root=await fetchPage(source.source_url); pages.push(root);
      const cinemaId=String(source.config?.cinema_id||(/data-cinema-id=["'](\d+)["']/i.exec(root.body)?.[1])||"004").padStart(3,"0");
      const endpoint=new URL("/api/scheduled-movies-ajax",root.url).toString();
      const schedule=await fetchPage(endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded;charset=UTF-8"},body:new URLSearchParams({cinema_id:cinemaId})}); pages.push(schedule);
      let movies:PicturehouseMovie[]=[]; try{movies=(JSON.parse(schedule.body) as PicturehousePayload).movies||[];}catch{movies=[];}
      const urls=[...new Map(movies.filter(movie=>movie.ScheduledFilmId&&movie.Title).map(movie=>[String(movie.ScheduledFilmId),new URL(`/movie-details/${cinemaId}/${movie.ScheduledFilmId}/${slug(String(movie.Title))}`,root.url).toString()])).values()].slice(0,Math.min(80,Number(source.config?.detail_fetch_limit)||50));
      for(let index=0;index<urls.length;index+=6){
        const batch=await Promise.allSettled(urls.slice(index,index+6).map((url)=>fetchPage(url)));
        for(let offset=0;offset<batch.length;offset++){const result=batch[offset];if(result.status==="fulfilled")pages.push(result.value);else failures.push({url:urls[index+offset],error:result.reason instanceof Error?result.reason.message:"detail_fetch_failed"});}
      }
      return {adapter_key:this.key,fetched_at,root_url:root.url,pages,failures};
    }catch(error){return {adapter_key:this.key,fetched_at,root_url:source.source_url,pages,failures:[...failures,{url:source.source_url,error:error instanceof Error?error.message:"fetch_failed"}]};}
  },
  parseSnapshot(source,payload):CinemaParseResult{
    const expected=addDays(localDate(payload.fetched_at,source.timezone),Math.max(0,source.expected_horizon_days-1));
    const errors=payload.failures.map(failure=>`fetch_failed:${failure.url}:${failure.error}`);
    const detailById=new Map<string,MovieDetails>(); for(const page of payload.pages){const id=movieIdFromUrl(page.url);if(id)detailById.set(id,parseDetails(page));}
    const schedule=payload.pages.find(page=>/\/api\/scheduled-movies-ajax(?:$|\?)/.test(page.url));
    let rows:CinemaNormalizedScreening[]=[]; if(!schedule)errors.push("schedule_page_missing"); else {const parsed=parseSchedule(source,schedule,detailById);rows=parsed.rows;errors.push(...parsed.errors);}
    rows=[...new Map(rows.map(row=>[row.screening_fingerprint,row])).values()].sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
    const dates=rows.map(row=>row.starts_at_local.slice(0,10)).sort(),max=dates.at(-1)||null,zero_result=rows.length===0;
    const fetch_complete=payload.failures.length===0&&Boolean(schedule),parser_complete=!errors.some(error=>/^(schedule_|movie_identity_missing|showtime_|fetch_failed)/.test(error));
    const scope_complete=fetch_complete&&parser_complete&&!zero_result&&rows.length>=source.min_records&&max!==null&&max>=expected;
    return {rows,records_parsed:rows.length,records_valid:rows.length,records_rejected:errors.filter(error=>error.startsWith("showtime_")).length,min_schedule_date:dates[0]||null,max_schedule_date:max,expected_until:expected,fetch_complete,parser_complete,scope_complete,fatal_error:false,zero_result,errors,metrics:{fetched_pages:payload.pages.length,detail_pages:detailById.size,unique_screenings:rows.length}};
  },
};
