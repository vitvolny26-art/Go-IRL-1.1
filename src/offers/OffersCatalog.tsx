import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarPlus, ChevronRight, Plus, X } from "lucide-react";
import { getTrustedAccessToken } from "../authSession";
import { cities, getCity } from "../config/cities";
import { localeByLanguage } from "../i18n";
import { planCityPostersEventBySlug } from "../city-posters/cityPostersPlanned";
import { CardShareAction } from "../components/CardShareAction";
import { sharePreparedTelegramCityPostersEvent } from "../telegramPreparedShare";
import { notifyTelegram } from "../telegram";
import type { Language } from "../types";

type Offer = {
  eventId: string;
  cityId: string;
  vertical: string;
  canonicalSlug: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  coverUrl: string;
  organizerName: string | null;
  officialUrl: string;
  providerName: string;
  priceFrom: number | null;
  priceTo: number | null;
  currency: string | null;
  priceConditions: string;
  free: boolean;
};

const copy: Record<Language, { title: string; subtitle: string; loading: string; empty: string; create: string; save: string; details: string; plan: string; share: string; saved: string; autoTelegram: string; telegramWarning: string }> = {
  ru: { title: "Акции", subtitle: "Опубликованные предложения в вашем городе", loading: "Загрузка акций…", empty: "Активных акций пока нет", create: "Создать акцию", save: "Сохранить", details: "Подробнее", plan: "Хочу пойти", share: "Поделиться", saved: "Акция сохранена", autoTelegram: "Заполнить из описания", telegramWarning: "Акция опубликована в GO IRL, но Telegram-публикация требует повторной отправки" },
  uk: { title: "Акції", subtitle: "Опубліковані пропозиції у вашому місті", loading: "Завантаження акцій…", empty: "Активних акцій поки немає", create: "Створити акцію", save: "Зберегти", details: "Детальніше", plan: "Хочу піти", share: "Поділитися", saved: "Акцію збережено", autoTelegram: "Заповнити з опису", telegramWarning: "Акцію опубліковано в GO IRL, але Telegram-публікацію треба повторити" },
  cs: { title: "Akce", subtitle: "Publikované nabídky ve vašem městě", loading: "Načítám akce…", empty: "Zatím nejsou aktivní akce", create: "Vytvořit akci", save: "Uložit", details: "Více", plan: "Chci jít", share: "Sdílet", saved: "Akce byla uložena", autoTelegram: "Vyplnit z popisu", telegramWarning: "Akce je publikovaná v GO IRL, ale Telegram publikaci je potřeba zopakovat" },
  en: { title: "Offers", subtitle: "Published offers in your city", loading: "Loading offers…", empty: "No active offers yet", create: "Create offer", save: "Save", details: "Details", plan: "Want to go", share: "Share", saved: "Offer saved", autoTelegram: "Fill from description", telegramWarning: "The offer is published in GO IRL, but Telegram publication needs a retry" },
  pl: { title: "Promocje", subtitle: "Opublikowane oferty w Twoim mieście", loading: "Ładowanie promocji…", empty: "Brak aktywnych promocji", create: "Utwórz promocję", save: "Zapisz", details: "Szczegóły", plan: "Chcę iść", share: "Udostępnij", saved: "Promocja zapisana", autoTelegram: "Uzupełnij z opisu", telegramWarning: "Promocja jest opublikowana w GO IRL, ale publikację Telegram trzeba ponowić" },
  sk: { title: "Akcie", subtitle: "Publikované ponuky vo vašom meste", loading: "Načítavam akcie…", empty: "Zatiaľ nie sú aktívne akcie", create: "Vytvoriť akciu", save: "Uložiť", details: "Viac", plan: "Chcem ísť", share: "Zdieľať", saved: "Akcia bola uložená", autoTelegram: "Vyplniť z popisu", telegramWarning: "Akcia je publikovaná v GO IRL, ale Telegram publikáciu treba zopakovať" },
};

const formatDate = (offer: Offer, language: Language) => {
  const formatter = new Intl.DateTimeFormat(localeByLanguage[language], { day: "numeric", month: "short", timeZone: offer.timezone || "Europe/Prague" });
  const start = formatter.format(new Date(offer.startsAt));
  if (!offer.endsAt) return start;
  const end = formatter.format(new Date(offer.endsAt));
  return start === end ? start : start + " – " + end;
};

const priceLabel = (offer: Offer) => {
  if (offer.free) return "Free";
  if (offer.priceFrom === null && offer.priceTo === null) return offer.priceConditions || "";
  const currency = offer.currency || "";
  if (offer.priceFrom !== null && offer.priceTo !== null && offer.priceFrom !== offer.priceTo) return offer.priceFrom + "–" + offer.priceTo + " " + currency;
  return String(offer.priceFrom ?? offer.priceTo ?? "") + (currency ? " " + currency : "");
};

export function OffersCatalog({ language, cityId, hasLegacyOffers = false }: { language: Language; cityId: string; hasLegacyOffers?: boolean }) {
  const t = copy[language];
  const city = getCity(cityId);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedCities, setSelectedCities] = useState<string[]>([cityId]);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [telegramDraft, setTelegramDraft] = useState("");
  const [telegramEdited, setTelegramEdited] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/offers?city=" + encodeURIComponent(cityId) + "&language=" + encodeURIComponent(language));
      const data = await response.json() as { offers?: Offer[]; error?: string };
      if (!response.ok) throw new Error(data.error || "offers_unavailable");
      setOffers(Array.isArray(data.offers) ? data.offers : []);
      setLoadError("");
    } catch {
      setLoadError("offers_unavailable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [cityId, language]);
  useEffect(() => {
    const open = () => { setSelectedCities([cityId]); setCreateOpen(true); setFormError(""); setNotice(""); };
    window.addEventListener("go-irl:offers-create", open);
    return () => window.removeEventListener("go-irl:offers-create", open);
  }, [cityId]);

  const cards = useMemo(() => offers.map((offer) => ({ offer, date: formatDate(offer, language), price: priceLabel(offer) })), [offers, language]);

  const toggleCity = (value: string) => setSelectedCities((current) =>
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const accessToken = await getTrustedAccessToken();
    if (!accessToken) return setFormError("trusted_auth_required");
    const description = descriptionDraft.trim();
    const telegramText = telegramDraft.trim() || description;
    const response = await fetch("/api/offers", {
      method: "POST",
      headers: { authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        language,
        title: data.get("title"),
        description,
        coverUrl: data.get("coverUrl"),
        officialUrl: data.get("officialUrl"),
        providerName: data.get("providerName"),
        vertical: data.get("vertical"),
        cities: selectedCities,
        startsAt: String(data.get("startsAt") || ""),
        endsAt: String(data.get("endsAt") || ""),
        priceFrom: data.get("priceFrom"),
        priceTo: data.get("priceTo"),
        currency: String(data.get("currency") || "CZK").toUpperCase(),
        priceConditions: data.get("priceConditions"),
        telegramText,
        telegramTopicKind: data.get("telegramTopicKind"),
        status: data.get("status"),
      }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string; warning?: string };
    if (!response.ok) {
      setFormError(payload.error || "offer_create_failed");
      notifyTelegram("error");
      return;
    }
    notifyTelegram(payload.warning ? "warning" : "success");
    setNotice(payload.warning === "telegram_publication_failed" ? t.telegramWarning : t.saved);
    form.reset();
    setDescriptionDraft("");
    setTelegramDraft("");
    setTelegramEdited(false);
    setSelectedCities([cityId]);
    await load();
  };

  return (
    <>
      <div className="page-title"><Plus /><div><h1>{t.title}</h1><p>{t.subtitle}</p></div></div>
      {loading && !hasLegacyOffers && <div className="sync-loading">{t.loading}</div>}
      {!loading && loadError && !hasLegacyOffers && <div className="form-error">{loadError}</div>}
      {!loading && !loadError && cards.length === 0 && !hasLegacyOffers && <div className="empty-state"><p>{t.empty}</p></div>}
      {!loading && !loadError && cards.length > 0 && (
        <div className="offers-promo-grid">
          {cards.map(({ offer, date, price }) => (
            <article className="offer-promo-card" data-offer-id={offer.canonicalSlug} key={offer.eventId}>
              <img className="offer-promo-campaign-artwork" src={offer.coverUrl} alt="" aria-hidden="true" />
              <div className="offer-promo-share-action">
                <CardShareAction title={offer.title} date={date} address={city.name[language]} url={offer.officialUrl} label={t.share} onTelegramShare={() => sharePreparedTelegramCityPostersEvent(offer.canonicalSlug, language)} />
              </div>
              <div className="offer-promo-copy">
                <span className="offer-promo-eyebrow">{offer.providerName || offer.organizerName || city.name[language]}</span>
                <h2>{offer.title}</h2>
                <p className="offer-promo-description">{offer.description}</p>
                <div className="offer-promo-meta">{price && <span>{price}</span>}<span>{city.name[language]}</span><span>{date}</span></div>
                <div className="offer-promo-actions">
                  <button className="offer-promo-plan" type="button" onClick={() => void planCityPostersEventBySlug(cityId, offer.canonicalSlug).then(() => notifyTelegram("success")).catch(() => notifyTelegram("error"))}><CalendarPlus /><span>{t.plan}</span></button>
                  <button className="offer-promo-cta" type="button" onClick={() => window.open(offer.officialUrl, "_blank", "noopener,noreferrer")}><span>{t.details}</span><ChevronRight /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {createOpen && (
        <div className="sheet-backdrop" onMouseDown={() => setCreateOpen(false)}>
          <article className="activity-sheet" role="dialog" aria-modal="true" aria-label={t.create} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <button className="sheet-close" onClick={() => setCreateOpen(false)} type="button" aria-label="Close"><X /></button>
            <div className="section-title"><Plus /><h2>{t.create}</h2></div>
            <form className="create-form" onSubmit={(event) => void submit(event)}>
              <label>Cover URL<input name="coverUrl" type="url" inputMode="url" required placeholder="https://…" /></label>
              <label>Title<input name="title" required maxLength={140} /></label>
              <label>Short description<textarea name="description" required maxLength={2000} rows={4} value={descriptionDraft} onChange={(event) => { const value = event.target.value; setDescriptionDraft(value); if (!telegramEdited) setTelegramDraft(value); }} /></label>
              <label>Official URL<input name="officialUrl" type="url" inputMode="url" required placeholder="https://…" /></label>
              <label>Provider<input name="providerName" placeholder="Official" /></label>
              <label>Vertical<select name="vertical" defaultValue="city_special"><option value="city_special">City special</option><option value="cinema">Cinema</option><option value="concerts">Concerts</option><option value="festivals">Festivals</option><option value="family">Family</option><option value="education">Education</option><option value="sport">Sport</option><option value="other">Other</option></select></label>
              <fieldset><legend>Cities</legend><div className="filter-row">{cities.map((item) => <button className={selectedCities.includes(item.id) ? "filter active" : "filter"} key={item.id} type="button" onClick={() => toggleCity(item.id)}>{item.name[language]}</button>)}</div></fieldset>
              <div className="form-row"><label>Starts<input name="startsAt" type="datetime-local" /></label><label>Ends<input name="endsAt" type="datetime-local" /></label></div>
              <div className="form-row"><label>Price from<input name="priceFrom" type="number" min="0" step="0.01" /></label><label>Price to<input name="priceTo" type="number" min="0" step="0.01" /></label></div>
              <label>Currency<input name="currency" defaultValue="CZK" maxLength={3} /></label>
              <label>Price / conditions<textarea name="priceConditions" maxLength={500} rows={2} /></label>
              <label>Telegram text<textarea name="telegramText" maxLength={3500} rows={5} value={telegramDraft} onChange={(event) => { setTelegramEdited(true); setTelegramDraft(event.target.value); }} /></label>
              <button className="secondary" type="button" onClick={() => { setTelegramEdited(false); setTelegramDraft(descriptionDraft); }}>{t.autoTelegram}</button>
              <label>Telegram topic<select name="telegramTopicKind" defaultValue="auto"><option value="auto">Auto</option><option value="promotions">Promotions</option><option value="chat">Chat</option><option value="music">Music</option><option value="culture">Culture</option><option value="sport">Sport</option><option value="outdoor">Outdoor</option><option value="education">Education</option><option value="games">Games</option><option value="kids">Kids</option><option value="festival">Festival / General</option></select></label>
              <label>Status<select name="status" defaultValue="draft"><option value="draft">draft</option><option value="ready">ready</option><option value="published">published</option></select></label>
              {formError && <div className="form-error">{formError}</div>}
              {notice && <div className="nearby-note">{notice}</div>}
              <button className="publish-button" disabled={!selectedCities.length} type="submit">{t.save}</button>
            </form>
          </article>
        </div>
      )}
    </>
  );
}
