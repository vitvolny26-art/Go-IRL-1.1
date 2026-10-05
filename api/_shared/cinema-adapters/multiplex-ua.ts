import { createHash } from "node:crypto";
import type {
  CinemaAdapter, CinemaFetchedPage, CinemaNormalizedScreening, CinemaParseResult, CinemaSourceConfig,
} from "../cinema-ingestion-types.js";

const userAgent = "GO-IRL-Cinema-Ingestion/2.0 (+schedule archival; contact via GO IRL)";
const requestTimeoutMs = 20_000;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const text = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ")
  .replace(/&amp;/g, "&").replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, " ").trim();
const slug = (value: string) => value.toLocaleLowerCase("ru-UA").normalize("NFKC")
  .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
const localDateInZone = (iso: string, timeZone: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"})
    .formatToParts(new Date(iso)).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
const addDays=(date:string,days:number)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const zoneOffsetMs=(instant:Date,timeZone:string)=>{const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(instant).map(x=>[x.type,x.value]));return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-instant.getTime();};
const zonedLocalToIso=(local:string,timeZone:string)=>{const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00$/.exec(local);if(!m)throw new Error("invalid_local_datetime");const guess=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]);let off=zoneOffsetMs(new Date(guess),timeZone);let utc=guess-off;const corrected=zoneOffsetMs(new Date(utc),timeZone);if(corrected!==off){off=corrected;utc=guess-off;}return new Date(utc).toISOString();};
const fetchText=async(url:string):Promise<CinemaFetchedPage>=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),requestTimeoutMs);try{const r=await fetch(url,{redirect:"follow",signal:controller.signal,headers:{"user-agent":userAgent,accept:"text/html,application/xhtml+xml"}});const body=await r.text();if(!r.ok)throw new Error(`http_${r.status}`);if(!body.trim())throw new Error("empty_body");return{url:r.url||url,status:r.status,body};}finally{clearTimeout(timer);}};

export const parseMultiplexUaPage=(source:CinemaSourceConfig,page:CinemaFetchedPage,fetchedAt:string)=>{
  const rows:CinemaNormalizedScreening[]=[]; const errors:string[]=[]; let rejected=0;
  if(/captcha|just a moment|attention required|sorry, you have been blocked/i.test(page.body)) return {rows,errors:["challenge_response"],rejected};
  const html=page.body;
  const movieLinks=[...html.matchAll(/href=["'](\/ru\/movie\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  if(!movieLinks.length) return {rows,errors:["movie_links_missing"],rejected};
  const seen=new Set<string>();
  for(let i=0;i<movieLinks.length;i++){
    const current=movieLinks[i], next=movieLinks[i+1];
    const start=current.index??0, end=next?.index??Math.min(html.length,start+12000);
    const block=html.slice(start,end);
    const moviePath=current[1], externalMovieId=current[2], title=text(current[3]);
    if(!title) continue;
    const original=text((block.match(/(?:Оригинальное название|Оригінальна назва)[^<]{0,80}<[^>]*>([\s\S]{1,160}?)<\//i)||[])[1]||"")||null;
    const year=Number((block.match(/\b(20\d{2})\b/)||[])[1]||0)||null;
    const durationMatch=block.match(/(?:\b(\d+)\s*(?:мин|хв)\b|\b(\d+)\s*ч\.?\s*(\d+)\s*(?:мин|хв))/i);
    const duration=durationMatch?(durationMatch[1]?+durationMatch[1]:(+durationMatch[2]*60+(+durationMatch[3]||0))):null;
    const sessionRe=/(?:data-date|datetime)=["'](20\d{2}-\d{2}-\d{2})[^"']*["'][\s\S]{0,500}?(?:data-time=["']([0-2]?\d:[0-5]\d)["']|>\s*([0-2]?\d:[0-5]\d)\s*<)/gi;
    let m:RegExpExecArray|null;
    while((m=sessionRe.exec(block))){
      const date=m[1], time=m[2]||m[3], key=`${externalMovieId}|${date}|${time}|${source.venue_id}`;
      if(seen.has(key))continue;seen.add(key);
      try{const local=`${date}T${time.padStart(5,"0")}:00`;rows.push({
        external_screening_id:key,screening_fingerprint:`sha256:${sha256(source.source_id+"|"+key)}`,
        external_movie_id:externalMovieId,movie_fingerprint:`${source.source_id}:${externalMovieId}`,title,original_title:original,
        release_year:year,duration_minutes:duration,starts_at_local:local,starts_at:zonedLocalToIso(local,source.timezone),
        timezone:source.timezone,audio_language:null,subtitle_languages:[],audio_type:null,version_type:null,format:null,auditorium:null,
        screening_tags:[],ticket_url:new URL(moviePath,page.url).toString(),source_url:page.url,raw_language:"ru",raw_version:null,
      });}catch(e){rejected++;errors.push(`screening_parse_failed:${externalMovieId}:${e instanceof Error?e.message:"unknown"}`);}
    }
  }
  return {rows,errors,rejected};
};

export const multiplexUaAdapter:CinemaAdapter={key:"multiplex_ua",
 async fetchSnapshot(source){const fetchedAt=new Date().toISOString();try{const page=await fetchText(source.source_url);return{adapter_key:this.key,fetched_at:fetchedAt,root_url:source.source_url,pages:[page],failures:[]};}catch(e){return{adapter_key:this.key,fetched_at:fetchedAt,root_url:source.source_url,pages:[],failures:[{url:source.source_url,error:e instanceof Error?e.message:"fetch_failed"}]};}},
 parseSnapshot(source,payload):CinemaParseResult{const errors=payload.failures.map(f=>`fetch_failed:${f.url}:${f.error}`);const rows:CinemaNormalizedScreening[]=[];let rejected=0;for(const page of payload.pages){const p=parseMultiplexUaPage(source,page,payload.fetched_at);rows.push(...p.rows);errors.push(...p.errors);rejected+=p.rejected;}const unique=new Map<string,CinemaNormalizedScreening>();for(const row of rows)unique.set(row.external_screening_id||row.screening_fingerprint,row);const normalized=[...unique.values()].sort((a,b)=>a.starts_at.localeCompare(b.starts_at)||a.title.localeCompare(b.title));const dates=normalized.map(r=>r.starts_at_local.slice(0,10)).sort();const fetchedLocal=localDateInZone(payload.fetched_at,source.timezone);const expectedUntil=addDays(fetchedLocal,Math.max(0,source.expected_horizon_days-1));const maxDate=dates.at(-1)||null;const fetchComplete=payload.pages.length>0&&payload.failures.length===0;const parserComplete=!errors.some(e=>/movie_links_missing|challenge_response|screening_parse_failed/.test(e));const recordsValid=normalized.length;const zeroResult=recordsValid===0;const scopeComplete=fetchComplete&&parserComplete&&!zeroResult&&recordsValid>=source.min_records&&maxDate!==null&&maxDate>=expectedUntil;return{rows:normalized,records_parsed:recordsValid+rejected,records_valid:recordsValid,records_rejected:rejected,min_schedule_date:dates[0]||null,max_schedule_date:maxDate,expected_until:expectedUntil,fetch_complete:fetchComplete,parser_complete:parserComplete,scope_complete:scopeComplete,fatal_error:false,zero_result:zeroResult,errors,metrics:{fetched_pages:payload.pages.length,fetch_failures:payload.failures.length,unique_screenings:recordsValid}};}
};
