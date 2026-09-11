import type { UserLanguage } from "../userLanguage.js";
import type { EventNotificationDelivery } from "./types.js";

type IssueTag = "organization" | "communication" | "punctuality" | "safety" | "other";

type OrganizerFeedbackCopy = {
  heading: string;
  responses: string;
  average: string;
  issues: string;
  noIssues: string;
  repeatYes: string;
  repeatNo: string;
  issueLabels: Record<IssueTag, string>;
};

const copy: Record<UserLanguage, OrganizerFeedbackCopy> = {
  ru: {
    heading: "📊 Отзывы участников", responses: "Ответов", average: "Средняя оценка организатора",
    issues: "Отметили проблемы", noIssues: "Проблемы не отмечены",
    repeatYes: "Хотят повторить", repeatNo: "Не хотят повторить",
    issueLabels: { organization: "Организация", communication: "Коммуникация", punctuality: "Пунктуальность", safety: "Безопасность", other: "Другое" },
  },
  uk: {
    heading: "📊 Відгуки учасників", responses: "Відповідей", average: "Середня оцінка організатора",
    issues: "Відзначили проблеми", noIssues: "Проблем не відзначили",
    repeatYes: "Хочуть повторити", repeatNo: "Не хочуть повторити",
    issueLabels: { organization: "Організація", communication: "Комунікація", punctuality: "Пунктуальність", safety: "Безпека", other: "Інше" },
  },
  cs: {
    heading: "📊 Zpětná vazba účastníků", responses: "Odpovědí", average: "Průměrné hodnocení organizátora",
    issues: "Uvedené problémy", noIssues: "Nebyly uvedeny žádné problémy",
    repeatYes: "Chtějí zopakovat", repeatNo: "Nechtějí zopakovat",
    issueLabels: { organization: "Organizace", communication: "Komunikace", punctuality: "Dochvilnost", safety: "Bezpečnost", other: "Jiné" },
  },
  en: {
    heading: "📊 Participant feedback", responses: "Responses", average: "Average organizer rating",
    issues: "Issues mentioned", noIssues: "No issues were mentioned",
    repeatYes: "Would repeat", repeatNo: "Would not repeat",
    issueLabels: { organization: "Organization", communication: "Communication", punctuality: "Punctuality", safety: "Safety", other: "Other" },
  },
  pl: {
    heading: "📊 Opinie uczestników", responses: "Odpowiedzi", average: "Średnia ocena organizatora",
    issues: "Wskazane problemy", noIssues: "Nie wskazano problemów",
    repeatYes: "Chcą powtórzyć", repeatNo: "Nie chcą powtórzyć",
    issueLabels: { organization: "Organizacja", communication: "Komunikacja", punctuality: "Punktualność", safety: "Bezpieczeństwo", other: "Inne" },
  },
  sk: {
    heading: "📊 Spätná väzba účastníkov", responses: "Odpovedí", average: "Priemerné hodnotenie organizátora",
    issues: "Uvedené problémy", noIssues: "Neboli uvedené žiadne problémy",
    repeatYes: "Chcú zopakovať", repeatNo: "Nechcú zopakovať",
    issueLabels: { organization: "Organizácia", communication: "Komunikácia", punctuality: "Dochvíľnosť", safety: "Bezpečnosť", other: "Iné" },
  },
};

const issueOrder: IssueTag[] = ["organization", "communication", "punctuality", "safety", "other"];
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;

export const buildOrganizerFeedbackText = (delivery: EventNotificationDelivery) => {
  const labels = copy[delivery.language];
  const payload = delivery.payload;
  const responseCount = count(payload.feedbackResponseCount);
  const ratingCount = count(payload.feedbackRatingCount);
  const average = typeof payload.feedbackAverageRating === "number" && Number.isFinite(payload.feedbackAverageRating)
    ? payload.feedbackAverageRating.toFixed(2).replace(/\.?0+$/, "")
    : null;
  const tagCounts = payload.feedbackTagCounts || {};
  const issueLines = issueOrder
    .map((tag) => ({ tag, count: count(tagCounts[tag]) }))
    .filter((item) => item.count > 0)
    .map((item) => `• ${labels.issueLabels[item.tag]} — ${item.count}`);

  return [
    labels.heading,
    `${labels.responses}: ${responseCount}`,
    `${labels.average}: ${ratingCount > 0 && average ? `${average}/5` : "—"}`,
    issueLines.length ? `${labels.issues}:\n${issueLines.join("\n")}` : labels.noIssues,
    `${labels.repeatYes}: ${count(payload.feedbackRepeatYesCount)}`,
    `${labels.repeatNo}: ${count(payload.feedbackRepeatNoCount)}`,
  ].join("\n");
};
