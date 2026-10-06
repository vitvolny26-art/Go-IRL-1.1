import { describe, expect, it } from "vitest";
import { picturehouseUkAdapter } from "./picturehouse-uk.js";
import type { CinemaRawSnapshotPayload, CinemaSourceConfig } from "../cinema-ingestion-types.js";

const root="https://www.picturehouses.com/cinema/the-ritzy";
const source: CinemaSourceConfig={id:"source",venue_id:"venue",source_id:"en_london_picturehouse_ritzy",adapter_key:"picturehouse_uk",source_url:root,fetch_method:"html",parser_version:"1.0.0",timezone:"Europe/London",enabled:false,fetch_interval_minutes:1440,expected_horizon_days:1,min_records:1,config:{cinema_id:"004"}};

describe("picturehouseUkAdapter",()=>{
  it("joins the Ritzy schedule to official movie-details metadata",()=>{
    const schedule={response:"success",movies:[{ScheduledFilmId:"HO00018431",Title:"Digger",CinemaId:"004",image_url:"https://cdn.example/digger.jpg",show_times:[{SessionId:"74749",date_f:"2026-10-06",time:"20:15",ScreenName:"Screen 3",SessionAttributesNames:["2D"]}]}]};
    const detailUrl="https://www.picturehouses.com/movie-details/004/HO00018431/digger";
    const detail=`<meta property="og:description" content="A rich official synopsis."><meta property="og:image" content="/images/digger.jpg"><ul><li class="directorInner">Director :</li><li>Alejandro González Iñárritu</li></ul><ul><li class="directorInner">Starring :</li><li>Tom Cruise, Jesse Plemons</li></ul><ul><li class="directorInner">Release Date :</li><li>02 Oct 2026</li></ul><ul><li class="directorInner">Certificate :</li><li>15</li></ul>`;
    const payload: CinemaRawSnapshotPayload={adapter_key:"picturehouse_uk",fetched_at:"2026-10-06T08:00:00.000Z",root_url:root,pages:[{url:root,status:200,body:"Ritzy"},{url:"https://www.picturehouses.com/api/scheduled-movies-ajax",status:200,body:JSON.stringify(schedule)},{url:detailUrl,status:200,body:detail}],failures:[]};
    const result=picturehouseUkAdapter.parseSnapshot(source,payload);
    expect(result.scope_complete).toBe(true);
    expect(result.rows[0]).toMatchObject({external_movie_id:"HO00018431",external_screening_id:"74749",title:"Digger",release_year:2026,description:"A rich official synopsis.",director:"Alejandro González Iñárritu",lead_actors:["Tom Cruise","Jesse Plemons"],age_rating:"15",audio_language:"en",source_url:detailUrl});
  });

  it("fails closed when schedule JSON or detail fetching is incomplete",()=>{
    const payload: CinemaRawSnapshotPayload={adapter_key:"picturehouse_uk",fetched_at:"2026-10-06T08:00:00.000Z",root_url:root,pages:[{url:root,status:200,body:"Ritzy"},{url:"https://www.picturehouses.com/api/scheduled-movies-ajax",status:200,body:"not-json"}],failures:[{url:"https://www.picturehouses.com/movie-details/004/HO1/x",error:"http_500"}]};
    const result=picturehouseUkAdapter.parseSnapshot(source,payload);
    expect(result.scope_complete).toBe(false);
    expect(result.fetch_complete).toBe(false);
    expect(result.parser_complete).toBe(false);
  });
});
