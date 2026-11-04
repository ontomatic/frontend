import type { ITask } from "@svar-ui/react-gantt";

import type { PlanLine, ScheduleEntry } from "~/lib/api/workspace";

// Gantt uses browser-local dates; keep the timeline's wall clock in KST.
const kstDate = (value: string) => new Date(new Date(Date.parse(value) + 9 * 3_600_000).toISOString().slice(0, -1));

export const getGanttData = (entries: (ScheduleEntry | PlanLine)[], allEntries = entries) => {
  // Build the palette from the full plan so track filters do not change colors.
  const tracks = [...new Set(allEntries.map((entry) => entry.track || "트랙 미기재"))];
  const tasks: ITask[] = entries.map((entry, index) => {
    const daily = "kind" in entry;
    const start = daily ? new Date(`${entry.start}T00:00:00`) : kstDate(entry.start);
    const end = daily ? new Date(`${entry.end}T00:00:00`) : kstDate(entry.end);
    // SVAR stores an exclusive end; document schedules include their last day.
    if (daily) end.setDate(end.getDate() + 1);
    return {
      id: index + 1,
      text: `${daily ? `${entry.code} ` : ""}${entry.process}`.trim(),
      start,
      end,
      type: "task",
      track: entry.track || "트랙 미기재",
      // shortcut: Colors repeat after six tracks; extend the palette for plans with more distinct tracks.
      colorIndex: tracks.indexOf(entry.track || "트랙 미기재") % 6,
      resource: entry.resource || "배정 미기재",
    };
  });
  return { tasks };
};
