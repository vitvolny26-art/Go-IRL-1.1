import { describe, expect, it } from "vitest";
import { cinemacityGlobalAdapter } from "./cinemacity-global.js";
import type { CinemaRawSnapshotPayload, CinemaSourceConfig } from "../cinema-ingestion-types.js";

const source=(id:string,url:string):CinemaSourceConfig=>({id:"00000000-0000-0000-0000-000000000031",venue_id:"00000000-0000-0000-0000-000000000032",source_id:id,adapter_key:"cinemacity_global",source_url:url,fetch_method:"html",parser_version:"1.0.0",timezone:"Europe/Prague",enabled:false,fetch_interval_minutes:1440,expected_horizon_days:1,min_records:1,config:{}});
const payload=(root:string,schedule:string,movie:string,detail:string):CinemaRawSnapshotPayload=>({adapter_key:"cinemacity_global",fetched_at:"2026-09-26T08:00:00.000Z",root_url:root,pages:[{url:root,status:200,body:schedule},{url:movie,status:200,body:detail}],failures:[]});

describe("cinemacityGlobalAdapter",()=>{
  it.each([
    ["cs_prague_cinemacity","https://www.cinemacity.cz/cinemas/flora/1052","https://www.cinemacity.cz/films/film-cs/7784s2r","Příběh hraček","Toy Story","Dobrodružný","Režisér CS"],
    ["pl_warsaw_cinemacity","https://www.cinema-city.pl/kina/arkadia/1074","https://www.cinema-city.pl/filmy/film-pl/7784s2r","Historia zabawek","Toy Story","Animowany","Reżyser PL"],
    ["sk_bratislava_cinemacity","https://www.cinemacity.sk/cinemas/aupark/1010","https://www.cinemacity.sk/films/film-sk/7784s2r","Príbeh hračiek","Toy Story","Animovaný","Režisér SK"],
  ])("enriches %s schedule rows from the official localized movie detail",(sourceId,root,movie,title,original,genre,director)=>{
    const labels=sourceId.startsWith("pl_")
      ? {original:"TYTUŁ ORYGINALNY",genre:"GATUNEK FILMU",actors:"OBSADA",director:"REŻYSER",production:"PRODUKCJA",age:"OGRANICZENIA WIEKOWE",duration:"CZAS TRWANIA FILMU"}
      : sourceId.startsWith("sk_")
        ? {original:"ORIGINÁLNY NÁZOV",genre:"ŽÁNER",actors:"HERCI",director:"REŽISÉR",production:"PRODUKCIA",age:"PRÍSTUPNÉ OD",duration:"DĹŽKA"}
        : {original:"ORIGINÁLNÍ NÁZEV",genre:"ŽÁNR",actors:"HRAJÍ",director:"REŽIE",production:"PRODUKCE",age:"VĚKOVÁ HRANICE",duration:"Délka filmu"};
    const api={body:{films:[{id:"7784s2r",name:title,length:100,posterLink:"https://img.example/api.jpg",link:movie,releaseYear:2026}],events:[{id:"event-1",filmId:"7784s2r",businessDay:"2026-09-26",eventDateTime:"2026-09-26T20:00:00",attributeIds:["2d"],languages:{original:["en"],subtitles:[sourceId.slice(0,2)]},auditorium:"1"}]}};
    const detail=`<meta property="og:description" content="Localized synopsis"><meta property="og:image" content="https://img.example/detail.jpg"><div>${labels.original}: ${original}</div><div>${labels.genre}: ${genre}</div><div>${labels.actors}: Actor One, Actor Two</div><div>${labels.director}: ${director}</div><div>${labels.production}: USA 2026</div><div>${labels.age}: 12</div><div>${labels.duration}: 100 min</div>`;
    const p: CinemaRawSnapshotPayload={adapter_key:"cinemacity_global",fetched_at:"2026-09-26T08:00:00.000Z",root_url:root,pages:[{url:root,status:200,body:"root"},{url:`${new URL(root).origin}/data-api-service/v1/quickbook/tenant/dates/in-cinema/cinema/until/2026-09-26`,status:200,body:JSON.stringify({body:{dates:["2026-09-26"]}})},{url:`${new URL(root).origin}/data-api-service/v1/quickbook/tenant/film-events/in-cinema/cinema/at-date/2026-09-26`,status:200,body:JSON.stringify(api)},{url:movie,status:200,body:detail}],failures:[]};
    const r=cinemacityGlobalAdapter.parseSnapshot(source(sourceId,root),p);
    expect(r.scope_complete).toBe(true);
    expect(r.rows[0]).toMatchObject({title,original_title:original,genres:[genre],description:"Localized synopsis",director,lead_actors:["Actor One","Actor Two"],age_rating:"12",source_url:movie});
    expect(r.metrics.detail_pages).toBe(1);
  });

  it("parses Czech schedule and rich official metadata",()=>{
    const root="https://www.cinemacity.cz/cinemas/flora/1052",movie="https://www.cinemacity.cz/films/toy-story-5-pribeh-hracek/7784s2r";
    const r=cinemacityGlobalAdapter.parseSnapshot(source("cs_prague_cinemacity",root),payload(root,`<div>26.09.2026</div><a href="${movie}">Toy Story 5: Příběh hraček</a><div>Dobrodružný, Animovaný |100 min</div><div>2D</div><div>angličtina (Dabing: čeština)</div><a href="/booking/1">13:50</a>`,movie,`<meta name="description" content="Hračky se vracejí."><div>ORIGINÁLNÍ NÁZEV: Toy Story 5</div><div>ŽÁNR: Dobrodružný, Animovaný</div><div>HRAJÍ: Actor One, Actor Two</div><div>REŽIE: Andrew Stanton</div><div>PRODUKCE: USA 2026</div><div>PŮVODNÍ ZNĚNÍ: EN</div><div>VĚKOVÁ HRANICE: MP</div><div>Délka filmu: 100 minut</div>`));
    expect(r.scope_complete).toBe(true);expect(r.rows[0]).toMatchObject({external_movie_id:"7784s2r",original_title:"Toy Story 5",release_year:2026,duration_minutes:100,genres:["Dobrodružný","Animovaný"],countries:["USA"],age_rating:"MP",director:"Andrew Stanton",lead_actors:["Actor One","Actor Two"],audio_language:"cs",version_type:"dubbed"});
  });
  it("parses Polish subtitles and metadata labels",()=>{
    const root="https://www.cinema-city.pl/kina/arkadia/1074",movie="https://www.cinema-city.pl/filmy/totalna-magia-2/8220s2r";
    const r=cinemacityGlobalAdapter.parseSnapshot(source("pl_warsaw_cinemacity",root),payload(root,`<div>Wtorek 26/09</div><a href="${movie}">Totalna magia 2</a><div>Fantasy |129 min</div><div>2D</div><div>angielski (Napisy: polski)</div><button>20:10</button>`,movie,`<div>TYTUŁ ORYGINALNY: Practical Magic 2</div><div>GATUNEK FILMU: fantasy, sci-fi</div><div>OBSADA: Sandra Bullock, Nicole Kidman</div><div>REŻYSER: Susanne Bier</div><div>PRODUKCJA: USA 2026</div><div>JĘZYK ORYGINALNY: angielski</div><div>OGRANICZENIA WIEKOWE: NA</div><div>CZAS TRWANIA FILMU: 129 min</div>`));
    expect(r.scope_complete).toBe(true);expect(r.rows[0]).toMatchObject({original_title:"Practical Magic 2",genres:["fantasy","sci-fi"],original_language:"en",director:"Susanne Bier",lead_actors:["Sandra Bullock","Nicole Kidman"],audio_language:"en",subtitle_languages:["pl"],version_type:"subtitled"});
  });
  it("parses Slovak labels and fails closed without selected date",()=>{
    const root="https://www.cinemacity.sk/cinemas/aupark/1010",movie="https://www.cinemacity.sk/films/bardotky/3677d3r3";
    const r=cinemacityGlobalAdapter.parseSnapshot(source("sk_bratislava_cinemacity",root),payload(root,`<div>26/09/2026</div><a href="${movie}">Bardotky</a><div>Komédia |88 min</div><div>2D</div><div>slovenčina</div><a>12:00</a>`,movie,`<div>ORIGINÁLNY NÁZOV: Bardotky</div><div>ŽÁNER: Komédia</div><div>HERCI: Dagmar Havlová, Eva Holubová</div><div>REŽISÉR: Hana Hendrychová</div><div>PRODUKCIA: CZ 2026</div><div>PRÍSTUPNÉ OD: 12-PLUS</div><div>DĹŽKA: 88 min</div>`));
    expect(r.scope_complete).toBe(true);expect(r.rows[0]).toMatchObject({countries:["CZ"],director:"Hana Hendrychová",lead_actors:["Dagmar Havlová","Eva Holubová"],audio_language:"sk"});
    const bad=cinemacityGlobalAdapter.parseSnapshot(source("sk_bratislava_cinemacity",root),{...payload(root,"<div>no date</div>",movie,""),pages:[{url:root,status:200,body:"<div>no date</div>"}]});expect(bad.scope_complete).toBe(false);expect(bad.errors).toContain("schedule_date_missing");
  });
});
