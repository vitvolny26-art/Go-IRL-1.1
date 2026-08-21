import { describe, expect, it } from "vitest";
import { resolveActivityMapNavigation } from "./activityMapNavigation";
describe("activity map provider preference",()=>{
 it("routes address events to saved Google Maps",()=>{ const r=resolveActivityMapNavigation({address:"Horní náměstí 1",cityName:"Olomouc"},"google"); const u=new URL(r.targetUrl||""); expect(u.hostname).toBe("www.google.com"); expect(u.searchParams.get("query")).toBe("Horní náměstí 1"); expect(u.searchParams.get("go_irl_provider")).toBe("google"); });
 it("re-resolves existing map URLs through saved provider",()=>{ const r=resolveActivityMapNavigation({locationUrl:"https://mapy.com/zakladni?q=Olomouc",address:"",cityName:"Olomouc"},"apple"); const u=new URL(r.targetUrl||""); expect(u.hostname).toBe("maps.apple.com"); expect(u.searchParams.get("q")).toBe("Olomouc"); });
 it("leaves target unresolved for ask every time",()=>{ const r=resolveActivityMapNavigation({address:"",cityName:"Olomouc"},null); expect(r.targetUrl).toBeNull(); expect(new URL(r.sourceUrl).searchParams.get("q")).toBe("Olomouc"); });
});
