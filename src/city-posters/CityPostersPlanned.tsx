import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, ExternalLink, MapPin, Ticket, Trash2 } from "lucide-react";
import type { Language } from "../types";
import { loadCityPostersPlanned, removeCityPostersPlan } from "./cityPostersPlanned";

const locale: Record<Language,string> = { ru:"ru-RU",uk:"uk-UA",cs:"cs-CZ",en:"en-GB",pl:"pl-PL",sk:"sk-SK" };
const copy: Record<Language,{loading:string;empty:string;error:string;remove:string;details:string}> = {
 ru:{loading:"Загружаем планы…",empty:"В запланированном пока ничего нет.",error:"Не удалось загрузить запланированное.",remove:"Убрать",details:"Подробнее"},
 uk:{loading:"Завантажуємо плани…",empty:"У запланованому поки нічого немає.",error:"Не вдалося завантажити заплановане.",remove:"Прибрати",details:"Докладніше"},
 cs:{loading:"Načítáme plány…",empty:"Zatím nemáte nic naplánováno.",error:"Naplánované akce se nepodařilo načíst.",remove:"Odebrat",details:"Podrobnosti"},
 en:{loading:"Loading plans…",empty:"Nothing planned yet.",error:"Planned events could not be loaded.",remove:"Remove",details:"Details"},
 pl:{loading:"Ładowanie planów…",empty:"Nie masz jeszcze nic zaplanowanego.",error:"Nie udało się wczytać planów.",remove:"Usuń",details:"Szczegóły"},
 sk:{loading:"Načítavajú sa plány…",empty:"Zatiaľ nemáte nič naplánované.",error:"Naplánované podujatia sa nepodarilo načítať.",remove:"Odobrať",details:"Podrobnosti"},
};
export function CityPostersPlanned({cityId,language}:{cityId:string;language:Language}) {
 const t=copy[language], client=useQueryClient(), key=["city-posters","planned",cityId,language];
 const result=useQuery({queryKey:key,queryFn:()=>loadCityPostersPlanned(cityId,language),staleTime:30_000});
 const remove=useMutation({mutationFn:removeCityPostersPlan,onSuccess:()=>client.invalidateQueries({queryKey:["city-posters","planned"]})});
 if(result.isLoading)return <div className="empty-state city-posters-empty-state"><CalendarDays/><p>{t.loading}</p></div>;
 if(result.isError)return <div className="empty-state city-posters-empty-state"><CalendarDays/><p>{t.error}</p></div>;
 if(!result.data?.length)return <div className="empty-state city-posters-empty-state"><CalendarDays/><p>{t.empty}</p></div>;
 return <div className="city-posters-planned-list">{result.data.map(item=><article className="city-posters-planned-card" key={item.eventId}>
  <div className="city-posters-planned-visual" aria-hidden="true">
    {item.heroMediaUrl?<img src={item.heroMediaUrl} alt=""/>:<div className="city-posters-planned-fallback"><Ticket/></div>}
  </div>
  <div className="city-posters-planned-copy">
    <time dateTime={item.startsAt}><CalendarDays/>{new Intl.DateTimeFormat(locale[language],{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:item.timezone}).format(new Date(item.startsAt))}</time>
    <h2>{item.title}</h2>{item.description?<p>{item.description}</p>:null}
    <div className="city-posters-planned-meta"><span><MapPin/>Olomouc</span></div>
    <div className="city-posters-planned-actions">
     {item.occurrenceUrl?<a href={item.occurrenceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink/><span>{t.details}</span><ChevronRight/></a>:null}
     <button type="button" onClick={()=>remove.mutate(item.eventId)} disabled={remove.isPending}><Trash2/><span>{t.remove}</span></button>
    </div>
  </div>
 </article>)}</div>;
}
