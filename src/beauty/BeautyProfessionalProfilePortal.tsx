import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import {
  Award,
  BadgeCheck,
  BookOpen,
  Brush,
  CalendarDays,
  ChevronRight,
  Clock3,
  ExternalLink,
  Languages,
  MapPin,
  MessageCircle,
  Scissors,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  X,
} from "lucide-react";
import { barberArtwork, resolveServiceArtwork } from "../services/serviceArtwork";
import { loadProfessionalDirectory, type ServicesProfessional } from "../services/servicesProfessionalDirectory";
import { useAppStore } from "../store";
import type { Language } from "../types";
import { buildBeautyProfessionalProfileSummary } from "./beautyProfessionalProfileModel";
import { beautyProfessionalPhotoPortfolioId } from "./beautyProfessionalPhoto";
import "./beauty-professional-profile.css";
import "./beauty-portfolio-rail.css";

type OpenProfile = {
  slug: string;
  opener: HTMLElement;
};

const locale: Record<Language, string> = {
  ru: "ru-RU",
  uk: "uk-UA",
  cs: "cs-CZ",
  en: "en-GB",
};

const copy = {
  ru: {
    eyebrow: "Профессиональный профиль",
    priceFrom: "Цена от",
    servicesCount: "Услуг",
    duration: "Длительность",
    priceList: "Открыть прайс",
    book: "Записаться",
    services: "Услуги и цены",
    about: "О мастере",
    benefits: "Всё для удобной записи",
    benefitPrice: "Прозрачные цены до подтверждения",
    benefitTime: "Выбор свободной даты и времени",
    benefitContact: "Контакт передаётся только с запросом",
    works: "Примеры работ",
    moreInstagram: "Больше в Instagram",
    experience: "Опыт",
    specialization: "Специализация",
    hygiene: "Гигиена и стерилизация",
    materials: "Материалы и бренды",
    spokenLanguages: "Языки общения",
    certificates: "Обучение и сертификаты",
    bookingNotes: "Важно перед записью",
    rating: "Рейтинг",
    newProfile: "Новый профиль",
    ratingHint: "Рейтинг появится после опубликованных отзывов.",
    reviews: "Отзывы",
    noReviews: "Отзывы пока не опубликованы.",
    noReviewsHint: "После запуска системы отзывов здесь появится опыт клиентов.",
    location: "Где принимает",
    availability: "Запись",
    availabilityHint: "Свободные даты и время доступны на следующем шаге.",
    loading: "Загружаем профиль мастера…",
    unavailable: "Профиль временно недоступен",
    close: "Закрыть",
    closeImage: "Закрыть фотографию",
    minutes: "мин",
  },
  uk: {
    eyebrow: "Професійний профіль",
    priceFrom: "Ціна від",
    servicesCount: "Послуг",
    duration: "Тривалість",
    priceList: "Відкрити прайс",
    book: "Записатися",
    services: "Послуги та ціни",
    about: "Про майстра",
    benefits: "Усе для зручного запису",
    benefitPrice: "Прозорі ціни до підтвердження",
    benefitTime: "Вибір вільної дати й часу",
    benefitContact: "Контакт передається лише із запитом",
    works: "Приклади робіт",
    moreInstagram: "Більше в Instagram",
    experience: "Досвід",
    specialization: "Спеціалізація",
    hygiene: "Гігієна та стерилізація",
    materials: "Матеріали та бренди",
    spokenLanguages: "Мови спілкування",
    certificates: "Навчання та сертифікати",
    bookingNotes: "Важливо перед записом",
    rating: "Рейтинг",
    newProfile: "Новий профіль",
    ratingHint: "Рейтинг з’явиться після опублікованих відгуків.",
    reviews: "Відгуки",
    noReviews: "Відгуки ще не опубліковані.",
    noReviewsHint: "Після запуску системи відгуків тут з’явиться досвід клієнтів.",
    location: "Де приймає",
    availability: "Запис",
    availabilityHint: "Вільні дати й час доступні на наступному кроці.",
    loading: "Завантажуємо профіль майстра…",
    unavailable: "Профіль тимчасово недоступний",
    close: "Закрити",
    closeImage: "Закрити фотографію",
    minutes: "хв",
  },
  cs: {
    eyebrow: "Profesionální profil",
    priceFrom: "Cena od",
    servicesCount: "Služeb",
    duration: "Délka",
    priceList: "Otevřít ceník",
    book: "Rezervovat",
    services: "Služby a ceny",
    about: "O profesionálovi",
    benefits: "Vše pro snadnou rezervaci",
    benefitPrice: "Jasné ceny před potvrzením",
    benefitTime: "Výběr volného data a času",
    benefitContact: "Kontakt se předá jen se žádostí",
    works: "Ukázky práce",
    moreInstagram: "Více na Instagramu",
    experience: "Praxe",
    specialization: "Specializace",
    hygiene: "Hygiena a sterilizace",
    materials: "Materiály a značky",
    spokenLanguages: "Jazyky komunikace",
    certificates: "Vzdělání a certifikáty",
    bookingNotes: "Důležité před rezervací",
    rating: "Hodnocení",
    newProfile: "Nový profil",
    ratingHint: "Hodnocení se zobrazí po zveřejnění recenzí.",
    reviews: "Recenze",
    noReviews: "Recenze zatím nebyly zveřejněny.",
    noReviewsHint: "Po spuštění systému recenzí se zde zobrazí zkušenosti klientů.",
    location: "Místo",
    availability: "Rezervace",
    availabilityHint: "Volné termíny jsou dostupné v dalším kroku.",
    loading: "Načítáme profil profesionála…",
    unavailable: "Profil je dočasně nedostupný",
    close: "Zavřít",
    closeImage: "Zavřít fotografii",
    minutes: "min",
  },
  en: {
    eyebrow: "Professional profile",
    priceFrom: "Price from",
    servicesCount: "Services",
    duration: "Duration",
    priceList: "Open price list",
    book: "Book now",
    services: "Services and prices",
    about: "About the professional",
    benefits: "Everything for easy booking",
    benefitPrice: "Clear prices before confirmation",
    benefitTime: "Choose an available date and time",
    benefitContact: "Contact is shared only with a request",
    works: "Work preview",
    moreInstagram: "More on Instagram",
    experience: "Experience",
    specialization: "Specialization",
    hygiene: "Hygiene and sterilization",
    materials: "Materials and brands",
    spokenLanguages: "Spoken languages",
    certificates: "Training and certificates",
    bookingNotes: "Before booking",
    rating: "Rating",
    newProfile: "New profile",
    ratingHint: "The rating will appear after reviews are published.",
    reviews: "Reviews",
    noReviews: "No reviews have been published yet.",
    noReviewsHint: "Client experiences will appear here when the review system launches.",
    location: "Location",
    availability: "Booking",
    availabilityHint: "Available dates and times are shown in the next step.",
    loading: "Loading the professional profile…",
    unavailable: "Profile temporarily unavailable",
    close: "Close",
    closeImage: "Close image",
    minutes: "min",
  },
} satisfies Record<Language, Record<string, string>>;

const price = (value: number, currency: string, language: Language) =>
  new Intl.NumberFormat(locale[language], { maximumFractionDigits: 0 }).format(value) + ` ${currency}`;

export function BeautyProfessionalProfilePortal() {
  const language = useAppStore((state) => state.language);
  const selectedCityId = useAppStore((state) => state.selectedCityId);
  const [openProfile, setOpenProfile] = useState<OpenProfile | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ url: string; alt: string } | null>(null);
  const [professionals, setProfessionals] = useState<ServicesProfessional[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const text = copy[language];

  useEffect(() => {
    const captureProfileOpen = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-beauty-slug] .services-professional-main") : null;
      if (!target) return;
      const wrapper = target.closest<HTMLElement>("[data-beauty-slug]");
      const slug = wrapper?.dataset.beautySlug;
      if (!slug) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setOpenProfile({ slug, opener: target });
    };
    document.addEventListener("click", captureProfileOpen, true);
    return () => document.removeEventListener("click", captureProfileOpen, true);
  }, []);

  useEffect(() => {
    if (!openProfile) return;
    let active = true;
    setState("loading");
    void loadProfessionalDirectory(selectedCityId, language)
      .then((items) => {
        if (!active) return;
        setProfessionals(items);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => { active = false; };
  }, [language, openProfile, selectedCityId]);

  useEffect(() => {
    if (!openProfile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("beauty-profile-open");
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedImage) return setSelectedImage(null);
      const nestedOverlayOpen = document.querySelector(".service-sheet-backdrop, .service-popup-backdrop");
      if (!nestedOverlayOpen) setOpenProfile(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("beauty-profile-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [openProfile, selectedImage]);

  const summary = useMemo(
    () => openProfile ? buildBeautyProfessionalProfileSummary(professionals, openProfile.slug) : null,
    [openProfile, professionals],
  );

  if (!openProfile) return null;

  const triggerCardAction = (selector: string) => {
    const wrapper = openProfile.opener.closest<HTMLElement>("[data-beauty-slug]");
    window.requestAnimationFrame(() => wrapper?.querySelector<HTMLButtonElement>(selector)?.click());
  };

  if (state !== "ready" || !summary) {
    return createPortal(
      <div className="beauty-pro-profile-backdrop" onPointerDown={() => setOpenProfile(null)}>
        <section className="beauty-pro-profile-shell beauty-pro-profile-state" role="dialog" aria-modal="true" aria-label={text.eyebrow} onPointerDown={(event) => event.stopPropagation()}>
          <button className="beauty-pro-profile-close" type="button" aria-label={text.close} onClick={() => setOpenProfile(null)}><X /></button>
          <Sparkles />
          <strong>{state === "error" ? text.unavailable : text.loading}</strong>
        </section>
      </div>,
      document.body,
    );
  }

  const { professional, services, priceFrom, durationFrom, durationTo } = summary;
  const artwork = resolveServiceArtwork(professional.profession, professional.serviceName);
  const profileProfession = professional.profession || (artwork === barberArtwork ? "barber" : artwork ? "nails" : "");
  const profileClassName = profileProfession
    ? `beauty-pro-profile-shell beauty-pro-profile-shell--${profileProfession}`
    : "beauty-pro-profile-shell";
  const backdropClassName = profileProfession
    ? `beauty-pro-profile-backdrop beauty-pro-profile-backdrop--${profileProfession}`
    : "beauty-pro-profile-backdrop";
  const durationRange = durationFrom === durationTo ? `${durationFrom} ${text.minutes}` : `${durationFrom}–${durationTo} ${text.minutes}`;
  const details = [
    { label: text.experience, value: professional.experience, icon: Award },
    { label: text.specialization, value: professional.specialization, icon: Sparkles },
    { label: text.hygiene, value: professional.hygiene, icon: ShieldCheck },
    { label: text.materials, value: professional.materials, icon: Brush },
    { label: text.spokenLanguages, value: professional.spokenLanguages, icon: Languages },
    { label: text.certificates, value: professional.certificates, icon: BadgeCheck },
    { label: text.bookingNotes, value: professional.bookingNotes, icon: BookOpen },
  ].filter((item) => item.value.trim());
  const showAbout = Boolean(professional.description.trim() || details.length);
  const professionalPhoto = professional.portfolio.find((item) => item.id === beautyProfessionalPhotoPortfolioId) || null;
  const showPortfolio = professional.portfolio.length > 0;

  return createPortal(
    <div className={backdropClassName} onPointerDown={() => setOpenProfile(null)}>
      <article className={profileClassName} role="dialog" aria-modal="true" aria-label={professional.displayName} onPointerDown={(event) => event.stopPropagation()}>
        <button className="beauty-pro-profile-close" type="button" aria-label={text.close} onClick={() => setOpenProfile(null)}><X /></button>

        <div className="beauty-pro-profile-intro">
          <header className="beauty-pro-profile-hero">
            {artwork && <img src={artwork.sheet} alt="" decoding="async" />}
            <div className="beauty-pro-profile-hero-shade" />
            <div className="beauty-pro-profile-hero-copy">
              <span><Sparkles />{text.eyebrow}</span>
              <h1>{professional.displayName}</h1>
              <p>{professional.serviceName}</p>
              <button type="button" onClick={() => window.open(`https://mapy.cz/zakladni?q=${encodeURIComponent(professional.publicLocation)}`, "_blank", "noopener,noreferrer")}><MapPin />{professional.publicLocation}</button>
              {professionalPhoto && <button
                className="beauty-pro-profile-professional-photo"
                type="button"
                aria-label={professionalPhoto.alt || professional.displayName}
                onClick={() => setSelectedImage({ url: professionalPhoto.imageUrl, alt: professionalPhoto.alt || professional.displayName })}
              >
                <img src={professionalPhoto.imageUrl} alt={professionalPhoto.alt || professional.displayName} loading="lazy" decoding="async" />
              </button>}
            </div>
          </header>

          <section className="beauty-pro-profile-stats" aria-label={text.eyebrow}>
            <div><Ticket /><span>{text.priceFrom}</span><strong>{price(priceFrom, professional.currency, language)}</strong></div>
            <div><Scissors /><span>{text.servicesCount}</span><strong>{services.length}</strong></div>
            <div><Clock3 /><span>{text.duration}</span><strong>{durationRange}</strong></div>
          </section>

          <nav className="beauty-pro-profile-primary-actions" aria-label={text.eyebrow}>
            <button className="secondary" type="button" onClick={() => triggerCardAction(".services-professional-actions .secondary")}><Scissors />{text.priceList}</button>
            <button className="primary" type="button" onClick={() => triggerCardAction(".services-professional-actions .primary")}><CalendarDays />{text.book}</button>
          </nav>
        </div>

        <div className="beauty-pro-profile-content">
          {showAbout && <section className="beauty-pro-profile-section beauty-pro-profile-about">
          <div className="beauty-pro-profile-heading"><div><small>01</small><h2>{text.about}</h2></div><Sparkles /></div>
          {professional.description && <p>{professional.description}</p>}
          {details.length > 0 && <div className="beauty-pro-profile-details">{details.map(({ label, value, icon: Icon }) => <article key={label}><Icon /><div><strong>{label}</strong><p>{value}</p></div></article>)}</div>}
          <div className="beauty-pro-profile-benefits">
            <h3>{text.benefits}</h3>
            <div><ShieldCheck /><span>{text.benefitPrice}</span></div>
            <div><CalendarDays /><span>{text.benefitTime}</span></div>
            <div><MessageCircle /><span>{text.benefitContact}</span></div>
          </div>
        </section>}

          <section className="beauty-pro-profile-section">
          <div className="beauty-pro-profile-heading"><div><small>02</small><h2>{text.services}</h2></div><Scissors /></div>
          <div className="beauty-pro-profile-price-list">{services.map((service) => <button type="button" key={service.serviceId} onClick={() => triggerCardAction(".services-professional-actions .secondary")}>
            <span><strong>{service.serviceName}</strong><small><Clock3 />{service.durationMinutes} {text.minutes}</small></span>
            <b>{price(service.priceCzk, service.currency, language)}</b>
            <ChevronRight />
          </button>)}</div>
        </section>

          {showPortfolio && <section className="beauty-pro-profile-section">
          <div className="beauty-pro-profile-heading"><div><small>03</small><h2>{text.works}</h2></div><Sparkles /></div>
          <div className="beauty-pro-profile-portfolio-rail" aria-label={text.works}>
            {professional.portfolio.map((item, index) => <button className={item.id === beautyProfessionalPhotoPortfolioId ? "beauty-pro-profile-portfolio-professional-photo" : undefined} type="button" key={item.id} onClick={() => setSelectedImage({ url: item.imageUrl, alt: item.alt })} data-portfolio-index={index + 1}><img src={item.imageUrl} alt={item.alt} loading="lazy" decoding="async" /></button>)}
          </div>
          {professional.instagramUrl && <a className="beauty-pro-profile-instagram" href={professional.instagramUrl} target="_blank" rel="noreferrer"><ExternalLink />{text.moreInstagram}<ChevronRight /></a>}
        </section>}

          <section className="beauty-pro-profile-section beauty-pro-profile-rating">
          <div className="beauty-pro-profile-heading"><div><small>04</small><h2>{text.rating}</h2></div><Star /></div>
          <div className="beauty-pro-profile-rating-card">
            <strong>—</strong>
            <span>{[0, 1, 2, 3, 4].map((item) => <Star key={item} />)}</span>
            <b>{text.newProfile}</b>
            <p>{text.ratingHint}</p>
          </div>
        </section>

          <section className="beauty-pro-profile-section beauty-pro-profile-reviews">
          <div className="beauty-pro-profile-heading"><div><small>05</small><h2>{text.reviews}</h2></div><MessageCircle /></div>
          <div className="beauty-pro-profile-empty-reviews"><MessageCircle /><strong>{text.noReviews}</strong><p>{text.noReviewsHint}</p></div>
        </section>

          <section className="beauty-pro-profile-contact-grid">
            <button type="button" onClick={() => window.open(`https://mapy.cz/zakladni?q=${encodeURIComponent(professional.publicLocation)}`, "_blank", "noopener,noreferrer")}><MapPin /><span><small>{text.location}</small><strong>{professional.publicLocation}</strong></span></button>
            <button type="button" onClick={() => triggerCardAction(".services-professional-actions .primary")}><CalendarDays /><span><small>{text.availability}</small><strong>{text.availabilityHint}</strong></span></button>
          </section>
        </div>

        <footer className="beauty-pro-profile-sticky-actions">
          <button className="secondary" type="button" onClick={() => triggerCardAction(".services-professional-actions .secondary")}><Scissors />{text.priceList}</button>
          <button className="primary" type="button" onClick={() => triggerCardAction(".services-professional-actions .primary")}><CalendarDays />{text.book}</button>
        </footer>
      </article>
      {selectedImage && <div className="beauty-pro-profile-lightbox" role="dialog" aria-modal="true" aria-label={selectedImage.alt || text.works} onPointerDown={() => setSelectedImage(null)}>
        <button type="button" aria-label={text.closeImage} onClick={() => setSelectedImage(null)}><X /></button>
        <img src={selectedImage.url} alt={selectedImage.alt} onPointerDown={(event) => event.stopPropagation()} />
      </div>}
    </div>,
    document.body,
  );
}
