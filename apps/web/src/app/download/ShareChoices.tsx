"use client";

import { useState } from "react";

interface Labels {
  usage: string;
  usageBody: string;
  project: string;
  projectBody: string;
  searchMiss: string;
  searchMissBody: string;
}

/**
 * The three sharing choices (UU PDP A3). Usage and project name start off;
 * the project name can only be chosen together with usage. The server action
 * enforces the same rule, this only keeps the form honest.
 */
export function ShareChoices({
  labels,
  initial,
}: {
  labels: Labels;
  initial: { usage: boolean; project: boolean; searchMiss: boolean };
}) {
  const [usage, setUsage] = useState(initial.usage);
  const [project, setProject] = useState(initial.usage && initial.project);

  return (
    <div className="mt-4 space-y-3">
      <Choice
        name="share_usage"
        title={labels.usage}
        body={labels.usageBody}
        checked={usage}
        onChange={(on) => {
          setUsage(on);
          if (!on) setProject(false);
        }}
      />
      <Choice
        name="share_project"
        title={labels.project}
        body={labels.projectBody}
        checked={project}
        disabled={!usage}
        onChange={setProject}
      />
      <Choice
        name="share_search_miss"
        title={labels.searchMiss}
        body={labels.searchMissBody}
        defaultChecked={initial.searchMiss}
      />
    </div>
  );
}

function Choice({
  name,
  title,
  body,
  checked,
  defaultChecked,
  disabled,
  onChange,
}: {
  name: string;
  title: string;
  body: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (on: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <input
        type="checkbox"
        name={name}
        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
      />
      <span>
        <span className="font-medium text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{body}</span>
      </span>
    </label>
  );
}
