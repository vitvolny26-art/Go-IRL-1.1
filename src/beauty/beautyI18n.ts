import type { Language } from "../types";
import type { BeautyValidationCode, BeautyWeekday } from "./beautySetupModel";

export const readBeautyLanguage = (): Language => {
  const value = localStorage.getItem("go-irl-language");
  return value === "ru" || value === "uk" || value === "cs" || value === "en" ? value : "en";
};

const weekdays: Record<Language, Record<BeautyWeekday, string>> = {
  ru: { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" },
  uk: { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Нд" },
  cs: { mon: "Po", tue: "Út", wed: "St", thu: "Čt", fri: "Pá", sat: "So", sun: "Ne" },
  en: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
  pl: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
  sk: { mon: "Po", tue: "Út", wed: "St", thu: "Čt", fri: "Pá", sat: "So", sun: "Ne" },
};

const errors: Record<Language, Record<BeautyValidationCode, string>> = {
  ru: {
    profile_display_name_required: "Укажите публичное имя.",
    profile_city_required: "Укажите город.",
    profile_public_location_required: "Укажите публичный район.",
    profile_contact_required: "Укажите контакт.",
    profile_exact_address_required: "Укажите точный адрес для подтверждённых записей.",
    service_name_required: "Укажите название услуги.",
    service_duration_invalid: "Длительность должна быть больше нуля.",
    service_price_invalid: "Цена не может быть отрицательной.",
    service_buffer_invalid: "Буфер не может быть отрицательным.",
    availability_weekday_required: "Выберите хотя бы один рабочий день.",
    availability_time_required: "Укажите начало и конец доступности.",
    availability_time_order_invalid: "Конец доступности должен быть позже начала.",
    availability_break_required: "Укажите начало и конец перерыва.",
    availability_break_order_invalid: "Конец перерыва должен быть позже начала.",
    availability_break_outside_working_hours: "Перерыв должен быть внутри рабочих часов.",
  },
  uk: {
    profile_display_name_required: "Вкажіть публічне ім’я.",
    profile_city_required: "Вкажіть місто.",
    profile_public_location_required: "Вкажіть публічний район.",
    profile_contact_required: "Вкажіть контакт.",
    profile_exact_address_required: "Вкажіть точну адресу для підтверджених записів.",
    service_name_required: "Вкажіть назву послуги.",
    service_duration_invalid: "Тривалість має бути більшою за нуль.",
    service_price_invalid: "Ціна не може бути від’ємною.",
    service_buffer_invalid: "Буфер не може бути від’ємним.",
    availability_weekday_required: "Оберіть хоча б один робочий день.",
    availability_time_required: "Вкажіть початок і кінець доступності.",
    availability_time_order_invalid: "Кінець доступності має бути пізніше початку.",
    availability_break_required: "Вкажіть початок і кінець перерви.",
    availability_break_order_invalid: "Кінець перерви має бути пізніше початку.",
    availability_break_outside_working_hours: "Перерва має бути в межах робочих годин.",
  },
  cs: {
    profile_display_name_required: "Vyplňte veřejné jméno.",
    profile_city_required: "Vyplňte město.",
    profile_public_location_required: "Vyplňte veřejnou oblast.",
    profile_contact_required: "Vyplňte kontaktní údaj.",
    profile_exact_address_required: "Vyplňte přesnou adresu pro potvrzené rezervace.",
    service_name_required: "Vyplňte název služby.",
    service_duration_invalid: "Délka služby musí být větší než nula.",
    service_price_invalid: "Cena nemůže být záporná.",
    service_buffer_invalid: "Buffer nemůže být záporný.",
    availability_weekday_required: "Vyberte alespoň jeden pracovní den.",
    availability_time_required: "Vyplňte začátek a konec dostupnosti.",
    availability_time_order_invalid: "Konec dostupnosti musí být později než začátek.",
    availability_break_required: "Vyplňte začátek a konec pauzy.",
    availability_break_order_invalid: "Konec pauzy musí být později než začátek.",
    availability_break_outside_working_hours: "Pauza musí být uvnitř pracovní doby.",
  },
  en: {
    profile_display_name_required: "Enter a public name.",
    profile_city_required: "Enter a city.",
    profile_public_location_required: "Enter a public area.",
    profile_contact_required: "Enter contact details.",
    profile_exact_address_required: "Enter the exact address for confirmed bookings.",
    service_name_required: "Enter a service name.",
    service_duration_invalid: "Duration must be greater than zero.",
    service_price_invalid: "Price cannot be negative.",
    service_buffer_invalid: "Buffer cannot be negative.",
    availability_weekday_required: "Select at least one working day.",
    availability_time_required: "Enter availability start and end.",
    availability_time_order_invalid: "Availability end must be later than start.",
    availability_break_required: "Enter break start and end.",
    availability_break_order_invalid: "Break end must be later than start.",
    availability_break_outside_working_hours: "The break must stay inside working hours.",
  },
  pl: {
    profile_display_name_required: "Enter a public name.",
    profile_city_required: "Enter a city.",
    profile_public_location_required: "Enter a public area.",
    profile_contact_required: "Enter contact details.",
    profile_exact_address_required: "Enter the exact address for confirmed bookings.",
    service_name_required: "Enter a service name.",
    service_duration_invalid: "Duration must be greater than zero.",
    service_price_invalid: "Price cannot be negative.",
    service_buffer_invalid: "Buffer cannot be negative.",
    availability_weekday_required: "Select at least one working day.",
    availability_time_required: "Enter availability start and end.",
    availability_time_order_invalid: "Availability end must be later than start.",
    availability_break_required: "Enter break start and end.",
    availability_break_order_invalid: "Break end must be later than start.",
    availability_break_outside_working_hours: "The break must stay inside working hours.",
  },
  sk: {
    profile_display_name_required: "Vyplňte veřejné jméno.",
    profile_city_required: "Vyplňte město.",
    profile_public_location_required: "Vyplňte veřejnou oblast.",
    profile_contact_required: "Vyplňte kontaktní údaj.",
    profile_exact_address_required: "Vyplňte přesnou adresu pro potvrzené rezervace.",
    service_name_required: "Vyplňte název služby.",
    service_duration_invalid: "Délka služby musí být větší než nula.",
    service_price_invalid: "Cena nemůže být záporná.",
    service_buffer_invalid: "Buffer nemůže být záporný.",
    availability_weekday_required: "Vyberte alespoň jeden pracovní den.",
    availability_time_required: "Vyplňte začátek a konec dostupnosti.",
    availability_time_order_invalid: "Konec dostupnosti musí být později než začátek.",
    availability_break_required: "Vyplňte začátek a konec pauzy.",
    availability_break_order_invalid: "Konec pauzy musí být později než začátek.",
    availability_break_outside_working_hours: "Pauza musí být uvnitř pracovní doby.",
  },
};

const copy = {
  ru: {
    title: "Настройка страницы записи", previewTitle: "Страница мастера", localFirst: "локально · без облака", loading: "Загружаем локальные данные Beauty…", reset: "Сбросить локальные данные Beauty?", resetDone: "Данные Beauty сброшены. Остальные данные GO IRL не изменены.", loadError: "Не удалось загрузить локальные данные Beauty.", saveError: "Не удалось сохранить локальные данные.", saved: "Сохранено в IndexedDB на этом устройстве", saving: "Сохраняем локально…", step: "Шаг", profile: "Профиль", service: "Услуга", availability: "Доступность", review: "Проверка", publicName: "Публичное имя", city: "Город", publicArea: "Публичный район", publicAreaHint: "Показывается на странице мастера.", contact: "Контакт", contactHint: "Хранится только в локальном кабинете мастера.", exactAddress: "Точный адрес", exactAddressHint: "Показывается только после подтверждения записи.", serviceName: "Название услуги", duration: "Длительность, мин", price: "Цена, Kč", buffer: "Буфер после услуги, мин", recurring: "Регулярная доступность", recurringHint: "Еженедельные рабочие часы. Разовые блокировки времени будут отдельной функцией.", workdays: "Рабочие дни", from: "С", to: "До", addBreak: "Добавить регулярный перерыв", edit: "Изменить", privateData: "Приватные данные", privateHint: "Точный адрес и контакт не показываются на странице мастера.", published: "Локальная mock-страница готова", publishedHint: "Данные не отправлены на сервер; страница работает без сети и WhatsApp.", copyLink: "Копировать mock-ссылку", copied: "Mock-ссылка скопирована.", openPreview: "Открыть страницу мастера", editSetup: "Изменить настройки", publicPreview: "Страница мастера · только просмотр", privacy: "Приватность", privacyHint: "Точный адрес и контакт здесь не отображаются.", chooseTime: "Выбрать время · mock", back: "Назад", home: "На главную GO IRL", continue: "Продолжить", publish: "Опубликовать mock-страницу", available: "Доступность",
  },
  uk: {
    title: "Налаштування сторінки запису", previewTitle: "Сторінка майстра", localFirst: "локально · без хмари", loading: "Завантажуємо локальні дані Beauty…", reset: "Скинути локальні дані Beauty?", resetDone: "Дані Beauty скинуто. Інші дані GO IRL не змінено.", loadError: "Не вдалося завантажити локальні дані Beauty.", saveError: "Не вдалося зберегти локальні дані.", saved: "Збережено в IndexedDB на цьому пристрої", saving: "Зберігаємо локально…", step: "Крок", profile: "Профіль", service: "Послуга", availability: "Доступність", review: "Перевірка", publicName: "Публічне ім’я", city: "Місто", publicArea: "Публічний район", publicAreaHint: "Показується на сторінці майстра.", contact: "Контакт", contactHint: "Зберігається лише в локальному кабінеті майстра.", exactAddress: "Точна адреса", exactAddressHint: "Показується лише після підтвердження запису.", serviceName: "Назва послуги", duration: "Тривалість, хв", price: "Ціна, Kč", buffer: "Буфер після послуги, хв", recurring: "Регулярна доступність", recurringHint: "Щотижневі робочі години. Разові блокування часу будуть окремою функцією.", workdays: "Робочі дні", from: "З", to: "До", addBreak: "Додати регулярну перерву", edit: "Змінити", privateData: "Приватні дані", privateHint: "Точна адреса й контакт не показуються на сторінці майстра.", published: "Локальна mock-сторінка готова", publishedHint: "Дані не надіслані на сервер; сторінка працює без мережі й WhatsApp.", copyLink: "Копіювати mock-посилання", copied: "Mock-посилання скопійовано.", openPreview: "Відкрити сторінку майстра", editSetup: "Змінити налаштування", publicPreview: "Сторінка майстра · лише перегляд", privacy: "Приватність", privacyHint: "Точна адреса й контакт тут не відображаються.", chooseTime: "Обрати час · mock", back: "Назад", home: "На головну GO IRL", continue: "Продовжити", publish: "Опублікувати mock-сторінку", available: "Доступність",
  },
  cs: {
    title: "Nastavení rezervační stránky", previewTitle: "Stránka profesionálky", localFirst: "lokálně · bez cloudu", loading: "Načítám lokální Beauty data…", reset: "Resetovat lokální Beauty data?", resetDone: "Beauty data byla resetována. Ostatní data GO IRL zůstala beze změny.", loadError: "Lokální Beauty data se nepodařilo načíst.", saveError: "Lokální uložení se nepodařilo.", saved: "Uloženo v IndexedDB tohoto zařízení", saving: "Ukládám lokálně…", step: "Krok", profile: "Profil", service: "Služba", availability: "Dostupnost", review: "Kontrola", publicName: "Veřejné jméno", city: "Město", publicArea: "Veřejná oblast", publicAreaHint: "Zobrazí se na stránce profesionálky.", contact: "Kontakt", contactHint: "Zůstává pouze v lokálním workspace.", exactAddress: "Přesná adresa", exactAddressHint: "Zobrazí se až po potvrzení rezervace.", serviceName: "Název služby", duration: "Délka, min", price: "Cena, Kč", buffer: "Buffer po službě, min", recurring: "Pravidelná dostupnost", recurringHint: "Týdenní pracovní doba. Jednorázové Time Blocks budou samostatná funkce.", workdays: "Pracovní dny", from: "Od", to: "Do", addBreak: "Přidat pravidelnou pauzu", edit: "Upravit", privateData: "Soukromé údaje", privateHint: "Přesná adresa a kontakt se na veřejné stránce nezobrazují.", published: "Lokální mock stránka je připravená", publishedHint: "Data se neodeslala na server; stránka funguje bez sítě a WhatsApp.", copyLink: "Kopírovat mock odkaz", copied: "Mock odkaz byl zkopírován.", openPreview: "Otevřít stránku profesionálky", editSetup: "Upravit nastavení", publicPreview: "Stránka profesionálky · pouze pro čtení", privacy: "Soukromí", privacyHint: "Přesná adresa ani kontakt se zde nezobrazují.", chooseTime: "Vybrat termín · mock", back: "Zpět", home: "Na hlavní stránku GO IRL", continue: "Pokračovat", publish: "Publikovat mock stránku", available: "Dostupnost",
  },
  en: {
    title: "Booking page setup", previewTitle: "Professional page", localFirst: "local · no cloud", loading: "Loading local Beauty data…", reset: "Reset local Beauty data?", resetDone: "Beauty data was reset. Other GO IRL data was not changed.", loadError: "Could not load local Beauty data.", saveError: "Could not save local data.", saved: "Saved in IndexedDB on this device", saving: "Saving locally…", step: "Step", profile: "Profile", service: "Service", availability: "Availability", review: "Review", publicName: "Public name", city: "City", publicArea: "Public area", publicAreaHint: "Shown on the professional page.", contact: "Contact", contactHint: "Stored only in the local professional workspace.", exactAddress: "Exact address", exactAddressHint: "Shown only after a booking is confirmed.", serviceName: "Service name", duration: "Duration, min", price: "Price, CZK", buffer: "Buffer after service, min", recurring: "Recurring availability", recurringHint: "Weekly working hours. One-time time blocks will be a separate feature.", workdays: "Working days", from: "From", to: "To", addBreak: "Add recurring break", edit: "Edit", privateData: "Private data", privateHint: "Exact address and contact are not shown on the professional page.", published: "Local mock page is ready", publishedHint: "No data was sent to a server; the page works without network or WhatsApp.", copyLink: "Copy mock link", copied: "Mock link copied.", openPreview: "Open professional page", editSetup: "Edit setup", publicPreview: "Professional page · read only", privacy: "Privacy", privacyHint: "Exact address and contact are not displayed here.", chooseTime: "Choose time · mock", back: "Back", home: "Back to GO IRL home", continue: "Continue", publish: "Publish mock page", available: "Availability",
  },
  pl: {
    title: "Booking page setup", previewTitle: "Professional page", localFirst: "local · no cloud", loading: "Loading local Beauty data…", reset: "Reset local Beauty data?", resetDone: "Beauty data was reset. Other GO IRL data was not changed.", loadError: "Could not load local Beauty data.", saveError: "Could not save local data.", saved: "Saved in IndexedDB on this device", saving: "Saving locally…", step: "Step", profile: "Profile", service: "Service", availability: "Availability", review: "Review", publicName: "Public name", city: "City", publicArea: "Public area", publicAreaHint: "Shown on the professional page.", contact: "Contact", contactHint: "Stored only in the local professional workspace.", exactAddress: "Exact address", exactAddressHint: "Shown only after a booking is confirmed.", serviceName: "Service name", duration: "Duration, min", price: "Price, CZK", buffer: "Buffer after service, min", recurring: "Recurring availability", recurringHint: "Weekly working hours. One-time time blocks will be a separate feature.", workdays: "Working days", from: "From", to: "To", addBreak: "Add recurring break", edit: "Edit", privateData: "Private data", privateHint: "Exact address and contact are not shown on the professional page.", published: "Local mock page is ready", publishedHint: "No data was sent to a server; the page works without network or WhatsApp.", copyLink: "Copy mock link", copied: "Mock link copied.", openPreview: "Open professional page", editSetup: "Edit setup", publicPreview: "Professional page · read only", privacy: "Privacy", privacyHint: "Exact address and contact are not displayed here.", chooseTime: "Choose time · mock", back: "Back", home: "Back to GO IRL home", continue: "Continue", publish: "Publish mock page", available: "Availability",
  },
  sk: {
    title: "Nastavení rezervační stránky", previewTitle: "Stránka profesionálky", localFirst: "lokálně · bez cloudu", loading: "Načítám lokální Beauty data…", reset: "Resetovat lokální Beauty data?", resetDone: "Beauty data byla resetována. Ostatní data GO IRL zůstala beze změny.", loadError: "Lokální Beauty data se nepodařilo načíst.", saveError: "Lokální uložení se nepodařilo.", saved: "Uloženo v IndexedDB tohoto zařízení", saving: "Ukládám lokálně…", step: "Krok", profile: "Profil", service: "Služba", availability: "Dostupnost", review: "Kontrola", publicName: "Veřejné jméno", city: "Město", publicArea: "Veřejná oblast", publicAreaHint: "Zobrazí se na stránce profesionálky.", contact: "Kontakt", contactHint: "Zůstává pouze v lokálním workspace.", exactAddress: "Přesná adresa", exactAddressHint: "Zobrazí se až po potvrzení rezervace.", serviceName: "Název služby", duration: "Délka, min", price: "Cena, Kč", buffer: "Buffer po službě, min", recurring: "Pravidelná dostupnost", recurringHint: "Týdenní pracovní doba. Jednorázové Time Blocks budou samostatná funkce.", workdays: "Pracovní dny", from: "Od", to: "Do", addBreak: "Přidat pravidelnou pauzu", edit: "Upravit", privateData: "Soukromé údaje", privateHint: "Přesná adresa a kontakt se na veřejné stránce nezobrazují.", published: "Lokální mock stránka je připravená", publishedHint: "Data se neodeslala na server; stránka funguje bez sítě a WhatsApp.", copyLink: "Kopírovat mock odkaz", copied: "Mock odkaz byl zkopírován.", openPreview: "Otevřít stránku profesionálky", editSetup: "Upravit nastavení", publicPreview: "Stránka profesionálky · pouze pro čtení", privacy: "Soukromí", privacyHint: "Přesná adresa ani kontakt se zde nezobrazují.", chooseTime: "Vybrat termín · mock", back: "Zpět", home: "Na hlavní stránku GO IRL", continue: "Pokračovat", publish: "Publikovat mock stránku", available: "Dostupnost",
  },
} as const;

export const getBeautyCopy = (language: Language) => ({
  ...copy[language],
  weekdays: weekdays[language],
  error: (code: BeautyValidationCode) => errors[language][code],
});

export const beautyHomeCopy: Record<Language, { title: string; hint: string; action: string }> = {
  ru: { title: "GO IRL Beauty", hint: "Записи и страница мастера", action: "Открыть" },
  uk: { title: "GO IRL Beauty", hint: "Записи та сторінка майстра", action: "Відкрити" },
  cs: { title: "GO IRL Beauty", hint: "Rezervace a stránka profesionálky", action: "Otevřít" },
  en: { title: "GO IRL Beauty", hint: "Bookings and professional page", action: "Open" },
  pl: { title: "GO IRL Beauty", hint: "Bookings and professional page", action: "Open" },
  sk: { title: "GO IRL Beauty", hint: "Rezervace a stránka profesionálky", action: "Otevřít" },
};
