import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getHierarchyProgram, isHierarchyRoot, type ActivityHierarchyProgram as HierarchyProgram } from "../activityHierarchy";
import { buildCanonicalActivityEntryPath } from "../auth/activityEntryIntent";
import { stripLeadingEmoji } from "../cardText";
import { applyHomeHierarchyCardVisibility } from "../homeHierarchyVisibility";
import { getTranslation } from "../i18n";
import { useAppStore } from "../store";
import type { Activity, Language } from "../types";
import { ActivityHierarchyProgram } from "./ActivityHierarchyProgram";
import { OrganizerDetailAction } from "./EventCardPrimitives";

const normalizeText = (value: string) => stripLeadingEmoji(value).trim();

export const findSportActivityForSheet = (
  activities: Activity[],
  language: Language,
  title: string,
  description: string,
) => {
  const normalizedTitle = title.trim();
  const normalizedDescription = description.trim();
  return activities.find((activity) => (
    normalizeText(activity.title[language]) === normalizedTitle
    && normalizeText(activity.description[language]) === normalizedDescription
  )) || null;
};

export const findHierarchyProgramForSheet = (
  activities: Activity[],
  language: Language,
  title: string,
  description: string,
) => {
  const activity = findSportActivityForSheet(activities, language, title, description);
  return activity && isHierarchyRoot(activity)
    ? getHierarchyProgram(activities, activity.id)
    : null;
};

export const hierarchyProgramSignature = (program: HierarchyProgram, language: Language) => [
  program.root.id,
  program.root.title[language],
  ...program.sections.flatMap(({ category, events }) => [
    category.id,
    category.title[language],
    ...events.flatMap((activity) => [activity.id, activity.title[language], activity.time]),
  ]),
  ...program.ungroupedEvents.flatMap((activity) => [activity.id, activity.title[language], activity.time]),
].join("|");

type OrganizerPortalState = {
  target: HTMLElement;
  activity: Activity;
};

type HierarchyPortalState = {
  target: HTMLElement;
  program: HierarchyProgram;
  signature: string;
};

export function OrganizerEventDetailsPortal() {
  const { activities, language, view } = useAppStore();
  const [organizerPortal, setOrganizerPortal] = useState<OrganizerPortalState | null>(null);
  const [hierarchyPortal, setHierarchyPortal] = useState<HierarchyPortalState | null>(null);
  const labels = getTranslation(language);

  useEffect(() => {
    const refresh = () => {
      applyHomeHierarchyCardVisibility();

      const sportSheet = document.querySelector<HTMLElement>(".activity-sheet.sport-sheet");
      const sportDetailList = sportSheet?.querySelector<HTMLElement>(".sport-detail-list");
      const sportTitle = sportSheet?.querySelector("h2")?.textContent || "";
      const sportDescription = sportSheet?.querySelector(".sport-sheet-hero p")?.textContent || "";
      const sportActivity = sportDetailList
        ? findSportActivityForSheet(activities, language, sportTitle, sportDescription)
        : null;
      const hasOrganizerCard = Array.from(sportDetailList?.querySelectorAll(".organizer-detail-action") || [])
        .some((node) => !node.closest(".organizer-detail-portal-slot"));

      if (!sportDetailList || !sportActivity || hasOrganizerCard) {
        setOrganizerPortal((current) => {
          current?.target.remove();
          return null;
        });
      } else {
        setOrganizerPortal((current) => {
          if (
            current?.target.isConnected
            && current.activity.id === sportActivity.id
            && current.target.parentElement === sportDetailList
          ) {
            return current;
          }

          current?.target.remove();
          const target = document.createElement("div");
          target.className = "organizer-detail-portal-slot";
          target.style.display = "contents";
          sportDetailList.appendChild(target);
          return { target, activity: sportActivity };
        });
      }

      const sheet = document.querySelector<HTMLElement>(".activity-sheet");
      const detailList = sheet?.querySelector<HTMLElement>(".detail-list, .sport-detail-list");
      const title = sheet?.querySelector("h2")?.textContent || "";
      const description = sheet?.querySelector(".sheet-description")?.textContent
        || sheet?.querySelector(".sport-sheet-hero p")?.textContent
        || "";
      const program = detailList
        ? findHierarchyProgramForSheet(activities, language, title, description)
        : null;

      if (!sheet || !detailList || !program) {
        setHierarchyPortal((current) => {
          current?.target.remove();
          return null;
        });
      } else {
        const signature = hierarchyProgramSignature(program, language);
        setHierarchyPortal((current) => {
          if (
            current?.target.isConnected
            && current.program.root.id === program.root.id
            && current.target.parentElement === sheet
          ) {
            return current.signature === signature ? current : { ...current, program, signature };
          }

          current?.target.remove();
          const target = document.createElement("div");
          target.className = "activity-hierarchy-program-portal-slot";
          sheet.insertBefore(target, detailList);
          return { target, program, signature };
        });
      }
    };

    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      setOrganizerPortal((current) => {
        current?.target.remove();
        return null;
      });
      setHierarchyPortal((current) => {
        current?.target.remove();
        return null;
      });
    };
  }, [activities, language, view]);

  const openHierarchyActivity = (activity: Activity) => {
    window.location.assign(buildCanonicalActivityEntryPath({
      activityId: activity.id,
      action: "view",
      route: "event",
      language,
    }, window.location.search));
  };

  return (
    <>
      {organizerPortal ? createPortal(
        <OrganizerDetailAction
          organizerKey={organizerPortal.activity.organizerKey}
          organizerName={organizerPortal.activity.organizer}
          label={labels.organizer}
        />,
        organizerPortal.target,
      ) : null}
      {hierarchyPortal ? createPortal(
        <ActivityHierarchyProgram
          program={hierarchyPortal.program}
          language={language}
          onOpen={openHierarchyActivity}
        />,
        hierarchyPortal.target,
      ) : null}
    </>
  );
}
