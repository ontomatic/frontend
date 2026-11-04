import { Gantt, Willow } from "@svar-ui/react-gantt";
import type { ITask, TID } from "@svar-ui/react-gantt";
import { useState } from "react";

import "@svar-ui/react-gantt/all.css";

interface GanttChartProps {
  tasks: ITask[];
  unit: "day" | "hour";
  label: string;
  onSelect: (id: TID) => void;
}

interface TaskBarProps {
  data: ITask;
}
const TaskBar = ({ data }: TaskBarProps) => (
  <div className={`gantt-task-text wx-content gantt-track-${data.colorIndex}`} title={data.text}>
    {data.text}
  </div>
);

const GanttChart = ({ tasks, unit, label, onSelect }: GanttChartProps) => {
  const [cellWidth, setCellWidth] = useState(100);
  const tracks = [...new Map(tasks.filter((task) => task.track).map((task) => [task.track, task])).values()];
  const start = Math.min(...tasks.map((task) => task.start?.getTime() ?? Infinity));
  const end = Math.max(...tasks.map((task) => task.end?.getTime() ?? -Infinity));
  const startMonth = Number.isFinite(start) ? new Date(start).toLocaleDateString("sv-SE").slice(0, 7) : "";
  const endMonth = Number.isFinite(end) ? new Date(end - 1).toLocaleDateString("sv-SE").slice(0, 7) : "";
  const period = (startMonth === endMonth ? startMonth : `${startMonth}–${endMonth}`).replaceAll("-", ".");
  return (
    <div className="grid min-w-0 gap-3">
      <p className="text-sm font-medium">{period || "공정명"}</p>
      {tracks.length > 0 && (
        <ul aria-label="트랙별 막대 색상" className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          {tracks.map((task) => (
            <li key={task.track} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`gantt-track-${task.colorIndex} size-3 rounded-sm bg-(--wx-gantt-task-color)`}
              />
              {task.track}
            </li>
          ))}
        </ul>
      )}
      <div className="relative min-w-0">
        <label className="gantt-scale-controls">
          <span>셀 너비</span>
          <input
            type="range"
            min={24}
            max={160}
            step={4}
            value={cellWidth}
            aria-label={`${unit === "day" ? "날짜" : "시간"} 셀 너비`}
            aria-valuetext={`${cellWidth}px`}
            onChange={(event) => setCellWidth(Number(event.target.value))}
          />
          <output className="w-10 text-right tabular-nums">{cellWidth}px</output>
        </label>
        <div className="min-w-0 overflow-x-auto" role="region" aria-label={label}>
          <div
            className="production-gantt min-w-[760px] overflow-hidden border border-stone-200 bg-white"
            style={{ height: Math.min(600, Math.max(240, (tasks.length + 2) * 40 + 16)) }}
          >
            <Willow>
              <Gantt
                tasks={tasks}
                start={Number.isFinite(start) ? new Date(start) : undefined}
                autoScale={false}
                readonly
                durationUnit={unit}
                lengthUnit={unit === "hour" ? "minute" : "day"}
                cellWidth={cellWidth}
                cellHeight={40}
                scaleHeight={40}
                gridWidth={0}
                columns={false}
                taskTemplate={TaskBar}
                scales={
                  unit === "day"
                    ? [
                        { unit: "month", step: 1, format: "%Y-%m" },
                        {
                          unit: "day",
                          step: 1,
                          format: (date: Date) => {
                            const day = String(date.getDate()).padStart(2, "0");
                            return date.getDate() === 1
                              ? `${String(date.getMonth() + 1).padStart(2, "0")}/${day}`
                              : day;
                          },
                        },
                      ]
                    : [
                        { unit: "day", step: 1, format: "%Y-%m-%d" },
                        { unit: "hour", step: 1, format: "%H:%i" },
                      ]
                }
                onSelectTask={({ id }) => onSelect(id)}
              />
            </Willow>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GanttChart;
