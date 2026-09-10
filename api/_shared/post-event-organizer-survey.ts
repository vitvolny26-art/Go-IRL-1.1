export type OrganizerSurveyLanguage = "ru" | "uk" | "cs" | "en" | "pl" | "sk";
export type OrganizerSurveyStep = "outcome" | "experience" | "attendance" | "no_shows" | "complete";

export type OrganizerSurveyRosterRow = {
  feedbackId: string;
  displayName: string;
  absent: boolean;
};

type InlineButton = { text: string; callback_data: string };

export type OrganizerSurveyCopy = {
  outcome: string;
  yes: string;
  no: string;
  experience: string;
  good: string;
  problems: string;
  attendance: string;
  noShows: string;
  absentPeople: string;
  done: string;
  repeat: string;
  completion: string;
  failed: string;
  selectAbsent: string;
  saved: string;
  attendanceConfirmed: string;
  attendanceAbsent: string;
  eventMissing: string;
};

export const organizerSurveyCopy: Record<OrganizerSurveyLanguage, OrganizerSurveyCopy> = {
  ru: {
    outcome: "Состоялась?",
    yes: "Да",
    no: "Нет",
    experience: "Как прошло?",
    good: "Хорошо",
    problems: "Были проблемы",
    attendance: "Все пришли?",
    noShows: "Были no-show",
    absentPeople: "Кто отсутствовал?",
    done: "Готово",
    repeat: "Хотите повторить это событие?",
    completion: "Спасибо, что воспользовались GO IRL",
    failed: "Не удалось обработать ответ. Попробуйте ещё раз.",
    selectAbsent: "Выберите хотя бы одного отсутствовавшего.",
    saved: "Ответ сохранён.",
    attendanceConfirmed: "Участие подтверждено.",
    attendanceAbsent: "Сохранено: вы не участвовали.",
    eventMissing: "Сохранено: событие не состоялось.",
  },
  uk: {
    outcome: "Подія відбулася?",
    yes: "Так",
    no: "Ні",
    experience: "Як усе пройшло?",
    good: "Добре",
    problems: "Були проблеми",
    attendance: "Усі прийшли?",
    noShows: "Були відсутні",
    absentPeople: "Хто був відсутній?",
    done: "Готово",
    repeat: "Хочете повторити цю подію?",
    completion: "Дякуємо, що скористалися GO IRL",
    failed: "Не вдалося обробити відповідь. Спробуйте ще раз.",
    selectAbsent: "Оберіть хоча б одного відсутнього.",
    saved: "Відповідь збережено.",
    attendanceConfirmed: "Участь підтверджено.",
    attendanceAbsent: "Збережено: ви не брали участі.",
    eventMissing: "Збережено: подія не відбулася.",
  },
  cs: {
    outcome: "Proběhla událost?",
    yes: "Ano",
    no: "Ne",
    experience: "Jak to proběhlo?",
    good: "Dobře",
    problems: "Byly problémy",
    attendance: "Přišli všichni?",
    noShows: "Někdo chyběl",
    absentPeople: "Kdo chyběl?",
    done: "Hotovo",
    repeat: "Chcete tuto událost zopakovat?",
    completion: "Děkujeme, že jste využili GO IRL",
    failed: "Odpověď se nepodařilo zpracovat. Zkuste to znovu.",
    selectAbsent: "Vyberte alespoň jednoho nepřítomného.",
    saved: "Odpověď byla uložena.",
    attendanceConfirmed: "Účast byla potvrzena.",
    attendanceAbsent: "Uloženo: nezúčastnili jste se.",
    eventMissing: "Uloženo: událost se nekonala.",
  },
  en: {
    outcome: "Did the event happen?",
    yes: "Yes",
    no: "No",
    experience: "How did it go?",
    good: "Good",
    problems: "There were problems",
    attendance: "Did everyone come?",
    noShows: "There were no-shows",
    absentPeople: "Who was absent?",
    done: "Done",
    repeat: "Would you like to repeat this event?",
    completion: "Thank you for using GO IRL",
    failed: "Could not process the answer. Please try again.",
    selectAbsent: "Select at least one absent participant.",
    saved: "Answer saved.",
    attendanceConfirmed: "Attendance confirmed.",
    attendanceAbsent: "Saved: you did not attend.",
    eventMissing: "Saved: the event did not happen.",
  },
  pl: {
    outcome: "Czy wydarzenie się odbyło?",
    yes: "Tak",
    no: "Nie",
    experience: "Jak poszło?",
    good: "Dobrze",
    problems: "Były problemy",
    attendance: "Czy wszyscy przyszli?",
    noShows: "Były nieobecności",
    absentPeople: "Kto był nieobecny?",
    done: "Gotowe",
    repeat: "Czy chcesz powtórzyć to wydarzenie?",
    completion: "Dziękujemy za skorzystanie z GO IRL",
    failed: "Nie udało się przetworzyć odpowiedzi. Spróbuj ponownie.",
    selectAbsent: "Wybierz co najmniej jedną nieobecną osobę.",
    saved: "Odpowiedź została zapisana.",
    attendanceConfirmed: "Udział został potwierdzony.",
    attendanceAbsent: "Zapisano: nie uczestniczyłeś(-aś).",
    eventMissing: "Zapisano: wydarzenie się nie odbyło.",
  },
  sk: {
    outcome: "Uskutočnila sa udalosť?",
    yes: "Áno",
    no: "Nie",
    experience: "Ako to dopadlo?",
    good: "Dobre",
    problems: "Boli problémy",
    attendance: "Prišli všetci?",
    noShows: "Niekto chýbal",
    absentPeople: "Kto chýbal?",
    done: "Hotovo",
    repeat: "Chcete túto udalosť zopakovať?",
    completion: "Ďakujeme, že ste využili GO IRL",
    failed: "Odpoveď sa nepodarilo spracovať. Skúste to znova.",
    selectAbsent: "Vyberte aspoň jedného neprítomného.",
    saved: "Odpoveď bola uložená.",
    attendanceConfirmed: "Účasť bola potvrdená.",
    attendanceAbsent: "Uložené: nezúčastnili ste sa.",
    eventMissing: "Uložené: udalosť sa neuskutočnila.",
  },
};

const supported = (value: string | null | undefined): OrganizerSurveyLanguage | null => {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized.startsWith("ru")) return "ru";
  if (normalized.startsWith("uk")) return "uk";
  if (normalized.startsWith("cs")) return "cs";
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("pl")) return "pl";
  if (normalized.startsWith("sk")) return "sk";
  return null;
};

export const resolveOrganizerSurveyLanguage = (
  canonicalLanguage: string | null | undefined,
  telegramLanguage?: string | null,
): OrganizerSurveyLanguage => supported(canonicalLanguage) || supported(telegramLanguage) || "en";

const rowsOfTwo = (buttons: InlineButton[]) => {
  const rows: InlineButton[][] = [];
  for (let index = 0; index < buttons.length; index += 2) rows.push(buttons.slice(index, index + 2));
  return rows;
};

export const buildOrganizerSurveyText = (language: OrganizerSurveyLanguage, step: OrganizerSurveyStep) => {
  const copy = organizerSurveyCopy[language];
  if (step === "outcome") return copy.outcome;
  if (step === "experience") return copy.experience;
  if (step === "attendance") return copy.attendance;
  if (step === "no_shows") return copy.absentPeople;
  return copy.completion;
};

export const buildOrganizerSurveyKeyboard = (
  language: OrganizerSurveyLanguage,
  step: OrganizerSurveyStep,
  activityId: string,
  roster: OrganizerSurveyRosterRow[] = [],
) => {
  const copy = organizerSurveyCopy[language];
  if (step === "outcome") {
    return { inline_keyboard: [[
      { text: copy.yes, callback_data: `pe:q1:${activityId}:y` },
      { text: copy.no, callback_data: `pe:q1:${activityId}:n` },
    ]] };
  }
  if (step === "experience") {
    return { inline_keyboard: [[
      { text: copy.good, callback_data: `pe:q2:${activityId}:g` },
      { text: copy.problems, callback_data: `pe:q2:${activityId}:p` },
    ]] };
  }
  if (step === "attendance") {
    return { inline_keyboard: [[
      { text: copy.yes, callback_data: `pe:q3:${activityId}:a` },
      { text: copy.noShows, callback_data: `pe:q3:${activityId}:n` },
    ]] };
  }
  if (step === "no_shows") {
    const participantButtons = roster.map((participant) => ({
      text: `${participant.absent ? "✓ " : ""}${participant.displayName}`,
      callback_data: `pe:q4:${participant.feedbackId}:${participant.absent ? "p" : "a"}`,
    }));
    return {
      inline_keyboard: [
        ...rowsOfTwo(participantButtons),
        [{ text: copy.done, callback_data: `pe:q4d:${activityId}` }],
      ],
    };
  }
  return { inline_keyboard: [] as InlineButton[][] };
};

export const ORGANIZER_SURVEY_COMPLETION_CLEANUP_WINDOW_MS = 15 * 60_000;
