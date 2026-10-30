/** Kino000(SR): immutable source-to-catalog PLAN. It never performs or authorizes writes. */
export type SrVerifiedVenue = {
  source_id: string;
  cinema_key: string;
  cinema_name: string;
  cinema_address: string | null;
  venue_timezone: string;
  /** Explicit independent registry readback; not inferred from a title or source URL. */
  verified_from_registry: true;
};
export type SrSourceScreening = {
  screening_key: string;
  candidate_id: string;
  source_id: string;
  source_movie_key: string;
  starts_at: string;
  ticket_url: string;
  source_url: string;
  cinema_name: string;
};
export type SrSourceMovie = {
  candidate_id: string;
  rank: number;
  title: string;
  imdb_id: string;
  source_movie_keys: string[];
  translations: Record<string, {title: string; description: string; source_kind: string; source_url: string; row_key: string}>;
  screenings: SrSourceScreening[];
  showing_from: string;
  showing_until: string;
};
export type SrSourcePackage = {
  status: "SR_NINE_MOVIE_PACKAGE_PREPARED_NO_WRITE";
  week_key: string;
  run_id: string;
  ready_movie_count: number;
  screening_count: number;
  movies: SrSourceMovie[];
  write_authorized: false;
  publication_authorized: false;
  telegram_send_authorized: false;
};

export type SrCatalogDraft = {
  candidate_id: string;
  rank: number;
  source_movie_keys: string[];
  blockers: string[];
  movie: {
    city_id: "olomouc";
    selection_week_start: string;
    selection_week_end: string;
    rank: number;
    source_movie_key: string;
    imdb_id: string | null;
    canonical_title: string;
    poster_url: null;
    translations: Record<string, {title: string; description: string}>;
    readiness: {
      ready: false;
      source_snapshot_run_id: string;
      verified_source_run_id: null;
      source_identity_verified: false;
      poster_provenance_verified: false;
      screening_horizon_complete: false;
      localizations_provenance_verified: false;
      source_movie_keys: string[];
      localization_provenance: Record<string, {source_kind: string; source_url: string; row_key: string}>;
    };
    publication_state: "ready";
  };
  screenings: Array<{
    source_screening_key: string;
    cinema_key: string;
    cinema_name: string;
    cinema_address: string | null;
    venue_timezone: string;
    starts_at: string;
    source_id: string;
    source_url: string;
    ticket_url: string;
  }>;
};
export type SrCatalogStagingPlan = {
  status: "SR_CATALOG_STAGING_PLAN_NO_WRITE";
  week_key: string;
  run_id: string;
  movie_count: number;
  screening_count: number;
  drafts: SrCatalogDraft[];
  blockers: string[];
  ready_for_catalog_write: false;
  publication_authorized: false;
  telegram_send_authorized: false;
  write_authorized: false;
};
const dates = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;
const dateOk = (d: string) => /^\d{4}-\d\d-\d\d$/.test(d) && !Number.isNaN(Date.parse(d+"T00:00:00Z")) && new Date(d+"T00:00:00Z").toISOString().slice(0,10)===d;
const languages = ["ru","uk","cs","en","pl","sk"] as const;
const text = (s: unknown) => typeof s === "string" ? s.trim() : "";
const urlOk = (s: unknown) => {
  try {const u=new URL(text(s));return u.protocol==="https:" && Boolean(u.hostname);}catch{return false;}
};
const timestampWithOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const dateInVenue = (s: string, zone: string) => {
  if (typeof s !== "string" || !timestampWithOffset.test(s) || !Number.isFinite(Date.parse(s))) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(s));
    const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return `${o.year}-${o.month}-${o.day}`;
  }catch{return "";}
};

/** Pure planning only. Caller must read venues from authoritative cinema source/venue registry. */
export function buildSrCatalogStagingPlan(source: SrSourcePackage, venues: SrVerifiedVenue[]): SrCatalogStagingPlan {
  const week = dates.exec(text(source?.week_key));
  if (source?.status !== "SR_NINE_MOVIE_PACKAGE_PREPARED_NO_WRITE" ||
      source?.write_authorized !== false || source?.publication_authorized !== false ||
      source?.telegram_send_authorized !== false || !week || !dateOk(week[1]) || !dateOk(week[2]) || week[1]>week[2] ||
      !text(source.run_id) || !Array.isArray(source.movies) ||
      !Number.isSafeInteger(source.ready_movie_count) || source.ready_movie_count!==source.movies.length ||
      !Number.isSafeInteger(source.screening_count) || source.screening_count<1) {
    throw Error("cinema_sr_staging_source_contract_invalid");
  }
  const venueBySource = new Map<string,SrVerifiedVenue>();
  for (const v of venues) {
    if (!text(v.source_id) || venueBySource.has(v.source_id) || v.verified_from_registry!==true ||
        !text(v.cinema_key) || !text(v.cinema_name) || !text(v.venue_timezone)) {
      throw Error("cinema_sr_staging_venue_registry_invalid");
    }
    venueBySource.set(v.source_id,v);
  }
  const seenCandidates=new Set<string>(),seenRanks=new Set<number>(),seenKeys=new Set<string>(),seenMovieKeys=new Set<string>();
  const blockers:string[]=[]; const drafts:SrCatalogDraft[]=[];
  let count=0;
  for (const m of source.movies) {
    if (!text(m.candidate_id) || !text(m.title) || !Number.isSafeInteger(m.rank) || m.rank<1 || m.rank>10 ||
        seenCandidates.has(m.candidate_id) || seenRanks.has(m.rank) || !Array.isArray(m.screenings) || !m.screenings.length ||
        !Array.isArray(m.source_movie_keys) || !m.source_movie_keys.length) {
      throw Error("cinema_sr_staging_movie_identity_invalid");
    }
    seenCandidates.add(m.candidate_id);seenRanks.add(m.rank);
    const localBlockers:string[]=[];
    const fail=(reason:string)=>{if(!localBlockers.includes(reason))localBlockers.push(reason);};
    const movieKeys=new Set<string>();
    for (const key of m.source_movie_keys) {
      if(!text(key) || movieKeys.has(key) || seenMovieKeys.has(key) || !key.includes(":"))throw Error("cinema_sr_staging_source_movie_key_conflict");
      movieKeys.add(key);seenMovieKeys.add(key);
    }
    const translations:Record<string,{title:string;description:string}>={};
    const localization_provenance:Record<string,{source_kind:string;source_url:string;row_key:string}>={};
    for (const l of languages) {
      const t=m.translations?.[l];
      if (!t || !text(t.title) || !text(t.description) || !text(t.source_kind) ||
          t.row_key!==`${source.week_key}|${m.candidate_id}|${l}`) {
        fail(`localization_evidence_missing:${l}`);
      } else {
        translations[l]={title:t.title.trim(),description:t.description.trim()};
        localization_provenance[l]={source_kind:t.source_kind,source_url:text(t.source_url),row_key:t.row_key};
        if (t.source_kind!=="official_cinema" || !urlOk(t.source_url)) fail(`localization_independent_verification_required:${l}`);
      }
    }
    if (Object.keys(m.translations||{}).some(l=>!languages.includes(l as typeof languages[number]))) fail("localization_extra_language");
    const screenings:SrCatalogDraft["screenings"]=[];
    const seenDates:string[]=[];
    for (const s of m.screenings) {
      count++;
      if(s.candidate_id!==m.candidate_id || !text(s.screening_key) || seenKeys.has(s.screening_key) ||
         !movieKeys.has(s.source_movie_key) || !text(s.source_id) || !s.source_movie_key.startsWith(s.source_id+":") ||
         !s.screening_key.startsWith(s.source_id+"|") || !text(s.screening_key.slice(s.source_id.length+1))) {
        throw Error("cinema_sr_staging_screening_identity_invalid");
      }
      seenKeys.add(s.screening_key);
      const v=venueBySource.get(s.source_id);
      if(!v)fail(`verified_venue_registry_missing:${s.source_id}`);
      if(!urlOk(s.ticket_url) || !urlOk(s.source_url))fail(`screening_url_invalid:${s.screening_key}`);
      if (typeof s.starts_at !== "string" || !timestampWithOffset.test(s.starts_at) ||
          !Number.isFinite(Date.parse(s.starts_at))) fail(`screening_timestamp_invalid:${s.screening_key}`);
      const date=v?dateInVenue(s.starts_at,v.venue_timezone):"";
      if(v && !date)fail(`screening_date_or_timezone_invalid:${s.source_id}`);
      if(date)seenDates.push(date);
      if(v && text(s.cinema_name) && text(s.cinema_name)!==v.cinema_name) fail(`venue_name_source_conflict:${s.source_id}`);
      if(v) screenings.push({source_screening_key:s.screening_key,cinema_key:v.cinema_key,
        cinema_name:v.cinema_name,cinema_address:v.cinema_address,venue_timezone:v.venue_timezone,
        starts_at:s.starts_at,source_id:s.source_id,source_url:s.source_url,ticket_url:s.ticket_url});
    }
    seenDates.sort();
    if(!dateOk(m.showing_from) || !dateOk(m.showing_until) ||
       seenDates.length!==m.screenings.length || seenDates[0]!==m.showing_from || seenDates.at(-1)!==m.showing_until) {
      fail("screening_date_range_not_verified");
    }
    // A snapshot proves staging input, not canonical poster, independent provenance, or full source horizon.
    fail("canonical_poster_unverified");
    fail("source_horizon_completeness_unverified");
    fail("catalog_uuid_readback_required");
    for(const b of localBlockers)if(!blockers.includes(b))blockers.push(b);
    drafts.push({candidate_id:m.candidate_id,rank:m.rank,source_movie_keys:[...m.source_movie_keys],blockers:localBlockers,
      movie:{city_id:"olomouc",selection_week_start:week[1],selection_week_end:week[2],rank:m.rank,
        source_movie_key:m.candidate_id,imdb_id:/^tt\d{7,10}$/.test(m.imdb_id)?m.imdb_id:null,
        canonical_title:m.title,poster_url:null,translations,publication_state:"ready",
        readiness:{ready:false,source_snapshot_run_id:source.run_id,verified_source_run_id:null,
          source_identity_verified:false,poster_provenance_verified:false,screening_horizon_complete:false,
          localizations_provenance_verified:false,source_movie_keys:[...m.source_movie_keys],localization_provenance}},
      screenings});
  }
  if(count!==source.screening_count)throw Error("cinema_sr_staging_screening_count_invalid");
  return {status:"SR_CATALOG_STAGING_PLAN_NO_WRITE",week_key:source.week_key,run_id:source.run_id,
    movie_count:drafts.length,screening_count:count,drafts,blockers,
    ready_for_catalog_write:false,publication_authorized:false,telegram_send_authorized:false,write_authorized:false};
}
