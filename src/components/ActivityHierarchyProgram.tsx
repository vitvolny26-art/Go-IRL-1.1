import { ChevronRight, ListTree } from "lucide-react";
import type { ActivityHierarchyProgram as HierarchyProgram } from "../activityHierarchy";
import { stripLeadingEmoji } from "../cardText";
import { formatEventTime } from "../eventTime";
import type { Activity, Language } from "../types";
import "./ActivityHierarchyProgram.css";

const copy: Record<Language, { title: string; events: string; empty: string; ungrouped: string }> = {
  ru: { title: "Программа фестиваля", events: "событий", empty: "События появятся позже", ungrouped: "Другие события" },
  uk: { title: "Програма фестивалю", events: "подій", empty: "Події з’являться пізніше", ungrouped: "Інші події" },
  cs: { title: "Program festivalu", events: "událostí", empty: "Události budou doplněny později", ungrouped: "Další události" },
  en: { title: "Festival program", events: "events", empty: "Events will be added later", ungrouped: "Other events" },
};

type ActivityHierarchyProgramProps = {
  program: HierarchyProgram;
  language: Language;
  onOpen: (activity: Activity) => void;
};

function ProgramEventButton({ activity, language, onOpen }: { activity: Activity; language: Language; onOpen: (activity: Activity) => void }) {
  const time = formatEventTime(activity.time);
  return (
    <button className="activity-hierarchy-event" type="button" onClick={() => onOpen(activity)} data-activity-id={activity.id}>
      <time>{time || "—"}</time>
      <span className="activity-hierarchy-event-copy">
        <strong>{stripLeadingEmoji(activity.activity[language])}</strong>
        <small>{stripLeadingEmoji(activity.title[language])}</small>
      </span>
      <ChevronRight aria-hidden="true" />
    </button>
  );
}

export function ActivityHierarchyProgram({ program, language, onOpen }: ActivityHierarchyProgramProps) {
  const labels = copy[language];
  if (!program.sections.length && !program.ungroupedEvents.length) return null;

  return (
    <section className="activity-hierarchy-program" aria-label={labels.title}>
      <div className="activity-hierarchy-program-header">
        <ListTree aria-hidden="true" />
        <div>
          <strong>{labels.title}</strong>
          <span>{program.eventCount} {labels.events}</span>
        </div>
      </div>

      {program.sections.map(({ category, events }) => (
        <section className="activity-hierarchy-section" key={category.id}>
          <div className="activity-hierarchy-section-header" data-activity-id={category.id}>
            <span>
              <strong>{stripLeadingEmoji(category.activity[language])}</strong>
              <small>{events.length} {labels.events}</small>
            </span>
          </div>
          {events.length ? (
            <div className="activity-hierarchy-events">
              {events.map((activity) => <ProgramEventButton key={activity.id} activity={activity} language={language} onOpen={onOpen} />)}
            </div>
          ) : (
            <p className="activity-hierarchy-empty">{labels.empty}</p>
          )}
        </section>
      ))}

      {program.ungroupedEvents.length ? (
        <section className="activity-hierarchy-section">
          <div className="activity-hierarchy-ungrouped-title">{labels.ungrouped}</div>
          <div className="activity-hierarchy-events">
            {program.ungroupedEvents.map((activity) => <ProgramEventButton key={activity.id} activity={activity} language={language} onOpen={onOpen} />)}
          </div>
        </section>
      ) : null}
    </section>
  );
}
