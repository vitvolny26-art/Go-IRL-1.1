import { createHash } from "node:crypto";
import type { CinemaAdapter, CinemaFetchedPage, CinemaNormalizedScreening, CinemaParseResult, CinemaRawSnapshotPayload, CinemaSourceConfig } from "../cinema-ingestion-types.js";

const ua = "GO-IRL-Cinema-Ingestion/2.0 (+official Cinema City)";
const timeoutMs = 20_000;
const decode = (s: string) => s.replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'");
const text = (html: string) => decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<img\b[^>]*(?:alt|title)=["']([^"']*)["'][^>]*>/gi," $1 ").replace(/<(?:br|\/p|\/div|\/li|\/h\d|\/button|\/a|\/section|\/article)>/gi,"\n").replace(/<[^>]+>/g," ")).replace(/[ \t]+/g," ").replace(/\n+/g,"\n").trim();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const abs = (href: string, base: string) => { try { return new URL(decode(href), base).toString(); } catch { return null; } };

const fetchPage = async (url: string): Promise<CinemaFetchedPage> => {
  const c = new AbortController(); const timer = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(url,{redirect:"follow",signal:c.signal,headers:{"user-agent":ua,accept:"text/html,application/xhtml+xml"}});
    const body = await r.text(); if(!r.ok) throw new Error(`http_${r.status}`); if(!body.trim()) throw new Error("empty_body");
    return {url:r.url||url,status:r.status,body};
  } finally { clearTimeout(timer); }
};

const localDate = (iso: string, tz: string) => {
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(iso)).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
const addDays = (d: string,n: number) => { const x=new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().slice(0,10); };
const offsetMs = (x: Date,tz:string) => {
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(x).map(v=>[v.type,v.value]));
  return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-x.getTime();
};
const toIso = (s:string,tz:string) => {
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00$/.exec(s); if(!m) throw new Error("invalid_local_datetime");
  const g=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]); let u=g-offsetMs(new Date(g),tz); const c=offsetMs(new Date(u),tz); if(c!==offsetMs(new Date(g),tz))u=g-c; return new Date(u).toISOString();
};

const movieId = (url:string) => /\/(?:films|filmy)\/[^/?#]+\/([A-Za-z0-9]+)\/?$/i.exec(new URL(url).pathname)?.[1]||null;
const movieLinks = (html:string,base:string) => {
  const origin=new URL(base).origin, out=new Map<string,{id:string,url:string,title:string,index:number}>();
  for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const u=abs(m[1],base); if(!u||new URL(u).origin!==origin) continue; const id=movieId(u); if(!id)continue;
    const title=text(m[2]).replace(/\s+/g," ").trim(), old=out.get(id); if(!old||title.length>old.title.length)out.set(id,{id,url:u.replace(/\/$/,""),title,index:m.index??0});
  }
  return [...out.values()].sort((a,b)=>a.index-b.index);
};
const scheduleDate = (html:string) => { const m=/\b(\d{1,2})[./]\s*(\d{1,2})[./]\s*(20\d{2})\b/.exec(text(html)); return m?`${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`:null; };
const meta = (html:string,name:string) => new RegExp(`<meta\\b[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`,"i").exec(html)?.[1]||null;
const value = (t:string, labels:string[], stops:string[]) => new RegExp(`(?:${labels.join("|")})\\s*:?\\s*(.+?)(?=\\s+(?:${stops.join("|")})\\s*:?|$)`,"i").exec(t)?.[1]?.trim()||null;
const langCode=(v:string|null) => {
  if(!v)return null; const n=v.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").trim();
  return ({anglictina:"en",angielski:"en",english:"en",cestina:"cs",cesky:"cs",polski:"pl",slovencina:"sk",slovensky:"sk"} as Record<string,string>)[n]||null;
};

const details = (p:CinemaFetchedPage) => {
  const t=text(p.body).replace(/\s+/g," "), stops=["ORIGINÁLNÍ NÁZEV","TYTUŁ ORYGINALNY","ORIGINÁLNY NÁZOV","ŽÁNR","GATUNEK FILMU","ŽÁNER","HRAJÍ","OBSADA","HERCI","REŽIE","REŻYSER","REŽISÉR","PRODUKCE","PRODUKCJA","PRODUKCIA","PŮVODNÍ ZNĚNÍ","JĘZYK ORYGINALNY","PŘÍSTUPNOST","VĚKOVÁ HRANICE","OGRANICZENIA WIEKOWE","PRÍSTUPNÉ OD","Délka filmu","CZAS TRWANIA FILMU","DĹŽKA"];
  const prod=value(t,["PRODUKCE","PRODUKCJA","PRODUKCIA"],stops), yr=prod?/\b(19\d{2}|20\d{2})\b/.exec(prod):null;
  const list=(v:string|null)=>[...new Set((v||"").split(/\s*[,/|]\s*/).map(x=>x.trim()).filter(Boolean))].slice(0,8);
  return {
    original:value(t,["ORIGINÁLNÍ NÁZEV","TYTUŁ ORYGINALNY","ORIGINÁLNY NÁZOV"],stops),
    genres:list(value(t,["ŽÁNR","GATUNEK FILMU","ŽÁNER"],stops)),
    actors:list(value(t,["HRAJÍ","OBSADA","HERCI"],stops)),
    director:value(t,["REŽIE","REŻYSER","REŽISÉR"],stops),
    year:yr?+yr[1]:null,
    countries:prod?list(prod.replace(/\b(?:19\d{2}|20\d{2})\b/g,"")):[],
    language:langCode(value(t,["PŮVODNÍ ZNĚNÍ","JĘZYK ORYGINALNY"],stops))||value(t,["PŮVODNÍ ZNĚNÍ","JĘZYK ORYGINALNY"],stops),
    age:value(t,["PŘÍSTUPNOST","VĚKOVÁ HRANICE","OGRANICZENIA WIEKOWE","PRÍSTUPNÉ OD"],stops),
    duration:+(/(?:Délka filmu|CZAS TRWANIA FILMU|DĹŽKA)\s*:?\s*(\d{2,3})\s*(?:minut|min)/i.exec(t)?.[1]||0)||null,
    description:meta(p.body,"description")||meta(p.body,"og:description"),
    poster:meta(p.body,"og:image") ? abs(meta(p.body,"og:image")!,p.url) : null,
  };
};

const language = (line:string) => {
  const s=line.replace(/\s+/g," ").trim(), dub=/\((?:Dabing|Dubbing)\s*:\s*([^)]+)\)/i.exec(s), sub=/\((?:Titulky|Napisy)\s*:\s*([^)]+)\)/i.exec(s);
  if(dub)return {audio:langCode(dub[1]),subs:[] as string[],version:"dubbed",raw:s};
  if(sub)return {audio:langCode(s.slice(0,sub.index).trim()),subs:[langCode(sub[1])].filter((x):x is string=>Boolean(x)),version:"subtitled",raw:s};
  return {audio:langCode(s),subs:[] as string[],version:null,raw:s};
};

const parseBlock=(source:CinemaSourceConfig,date:string,b:{id:string,url:string,title:string,block:string},d:ReturnType<typeof details>|null)=>{
  const rows:CinemaNormalizedScreening[]=[], errors:string[]=[]; let rejected=0; const t=text(b.block);
  const dm=/\b(\d{2,3})\s*(?:minut|min)\b/i.exec(t), duration=d?.duration||(dm?+dm[1]:null);
  const lines=t.split("\n").map(x=>x.trim()).filter(Boolean), l=language(lines.find(x=>/(Titulky|Napisy|Dabing|Dubbing|angličtina|angielski|slovenčina|čeština|polski)/i.test(x))||"");
  const tags=[...new Set(lines.flatMap(x=>[...x.matchAll(/\b(2D|3D|4DX|IMAX|SCREENX|SUPERSCREEN)\b/gi)].map(m=>m[1].toUpperCase())))], format=tags.includes("3D")?"3D":tags.includes("4DX")?"4DX":"2D";
  const acts=[...b.block.matchAll(/<(?:a|button)\b([^>]*)>([\s\S]*?)<\/(?:a|button)>/gi)].flatMap(m=>[...text(m[2]).matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)].map(tm=>({time:`${tm[1].padStart(2,"0")}:${tm[2]}`,href:/\bhref=["']([^"']+)["']/i.exec(m[1])?.[1]||null})));
  for(const a of acts){try{const local=`${date}T${a.time}:00`,stable=[source.source_id,source.venue_id,b.id,local,format,l.raw].join("|");rows.push({
    external_screening_id:null,screening_fingerprint:`sha256:${hash(stable)}`,external_movie_id:b.id,movie_fingerprint:`${source.source_id}:${b.id}:${d?.year??"unknown"}`,
    title:b.title,original_title:d?.original||null,release_year:d?.year||null,duration_minutes:duration,poster_url:d?.poster||null,genres:d?.genres||[],countries:d?.countries||[],original_language:d?.language||null,age_rating:d?.age||null,description:d?.description||null,director:d?.director||null,lead_actors:d?.actors||[],
    starts_at_local:local,starts_at:toIso(local,source.timezone),timezone:source.timezone,audio_language:l.audio,subtitle_languages:l.subs,audio_type:null,version_type:l.version,format,auditorium:null,screening_tags:tags,ticket_url:a.href?abs(a.href,source.source_url):null,source_url:b.url,raw_language:l.raw||null,raw_version:tags.join(" ")||null
  });}catch(e){rejected++;errors.push(`screening_parse_failed:${b.id}:${e instanceof Error?e.message:"unknown"}`);}}
  if(!acts.length)errors.push(`screening_times_missing:${b.id}`); return {rows,errors,rejected};
};

export const cinemacityGlobalAdapter:CinemaAdapter={
  key:"cinemacity_global",
  async fetchSnapshot(source):Promise<CinemaRawSnapshotPayload>{
    const fetched_at=new Date().toISOString(),pages:CinemaFetchedPage[]=[];
    try{const root=await fetchPage(source.source_url);pages.push(root);const links=movieLinks(root.body,root.url).slice(0,Math.min(60,Number(source.config?.detail_fetch_limit)||40));
      for(let i=0;i<links.length;i+=6){const batch=await Promise.allSettled(links.slice(i,i+6).map(x=>fetchPage(x.url)));for(const r of batch)if(r.status==="fulfilled")pages.push(r.value);}
      return {adapter_key:this.key,fetched_at,root_url:root.url,pages,failures:[]};
    }catch(e){return {adapter_key:this.key,fetched_at,root_url:source.source_url,pages,failures:[{url:source.source_url,error:e instanceof Error?e.message:"fetch_failed"}]};}
  },
  parseSnapshot(source,payload):CinemaParseResult{
    const expected=addDays(localDate(payload.fetched_at,source.timezone),Math.max(0,source.expected_horizon_days-1)),errs=payload.failures.map(x=>`fetch_failed:${x.url}:${x.error}`),root=payload.pages[0],date=root?scheduleDate(root.body):null;
    const dm=new Map<string,ReturnType<typeof details>>();for(const p of payload.pages.slice(1)){const id=movieId(p.url);if(id)dm.set(id,details(p));}
    let rows:CinemaNormalizedScreening[]=[],rejected=0;if(!root)errs.push("schedule_page_missing");else if(!date)errs.push("schedule_date_missing");else{const links=movieLinks(root.body,root.url);if(!links.length)errs.push("movie_cards_missing");for(let i=0;i<links.length;i++){const p=parseBlock(source,date,{...links[i],block:root.body.slice(links[i].index,links[i+1]?.index??root.body.length)},dm.get(links[i].id)||null);rows.push(...p.rows);errs.push(...p.errors);rejected+=p.rejected;}}
    const uniq=new Map(rows.map(r=>[r.screening_fingerprint,r]));rows=[...uniq.values()].sort((a,b)=>a.starts_at.localeCompare(b.starts_at));const dates=rows.map(r=>r.starts_at_local.slice(0,10)).sort(),max=dates.at(-1)||null;
    const parser_complete=!errs.some(x=>/^(schedule_page_missing|schedule_date_missing|movie_cards_missing|screening_parse_failed)/.test(x)),fetch_complete=payload.pages.length>0&&payload.failures.length===0,zero_result=rows.length===0,scope_complete=fetch_complete&&parser_complete&&!zero_result&&rows.length>=source.min_records&&max!==null&&max>=expected;
    return {rows,records_parsed:rows.length+rejected,records_valid:rows.length,records_rejected:rejected,min_schedule_date:dates[0]||null,max_schedule_date:max,expected_until:expected,fetch_complete,parser_complete,scope_complete,fatal_error:false,zero_result,errors:errs,metrics:{fetched_pages:payload.pages.length,detail_pages:Math.max(0,payload.pages.length-1),unique_screenings:rows.length,rejected_screenings:rejected}};
  }
};
