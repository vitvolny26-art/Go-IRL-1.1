import { ChevronLeft } from "lucide-react";
import { getActivityHierarchy, getHierarchyParent, getHierarchyRoot } from "../activityHierarchy";
import { stripLeadingEmoji } from "../cardText";
import type { Activity, Language } from "../types";
import "./ActivityHierarchyBreadcrumb.css";

const copy: Record<Language, string> = {
  ru: "Вернуться к фестивалю",
  uk: "Повернутися до фестивалю",
  cs: "Zpět na festival",
  en: "Back to festival",
};

type Props = {
  activities: Activity[];
  activity: Activity;
  language: Language;
  onOpenRoot: (activity: Activity) => void;
};

export function ActivityHierarchyBreadcrumb({ activities, activity, language, onOpenRoot }: Props) {
  const hierarchy = getActivityHierarchy(activity);
  if (!hierarchy || hierarchy.level === "root") return null;

  const root = getHierarchyRoot(activities, activity);
  if (!root) return null;
  const parent = getHierarchyParent(activities, activity);

  return (
    <nav className="activity-hierarchy-breadcrumb" aria-label={copy[language]}>
      <button type="button" onClick={() => onOpenRoot(root)} data-activity-id={root.id}>
        <ChevronLeft aria-hidden="true" />
        <span>{stripLeadingEmoji(root.title[language])}</span>
      </button>
      {parent && parent.id !== root.id ? (
        <>
          <span className="activity-hierarchy-breadcrumb-separator" aria-hidden="true">/</span>
          <span className="activity-hierarchy-breadcrumb-parent">{stripLeadingEmoji(parent.activity[language])}</span>
        </>
      ) : null}
    </nav>
  );
}
