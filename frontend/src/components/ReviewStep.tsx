import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { getRankedExperiencesAndProjects } from "../api";
import type { RankedResponse, ExperienceItem, ProjectItem, SelectionEntry } from "../types";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

type SectionKey = "summary" | "skills" | "expertise_areas" | "functional_skills" | "education" | "languages" | "certifications" | "countries_worked" | "professional_affiliations" | "experience" | "projects";

function Section({
  title,
  items,
  selected,
  onToggle,
  onToggleAll,
  renderItem,
}: {
  title: string;
  items: (ExperienceItem | ProjectItem)[];
  selected: Set<number>;
  onToggle: (idx: number) => void;
  onToggleAll: (allSelected: boolean) => void;
  renderItem: (item: ExperienceItem | ProjectItem) => React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const allSelected = items.length > 0 && items.every((item) =>
    selected.has("experience_index" in item ? item.experience_index : item.project_index)
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-t-xl border-b border-slate-100 bg-slate-50 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold">{title}</span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {selected.size} selected
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <div className="p-3 space-y-2">
          {items.length === 0 && <p className="text-sm text-slate-500">No items.</p>}
          {items.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleAll(allSelected);
              }}
              className="text-xs font-semibold text-[#C1121F] hover:underline"
            >
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          )}
          {items.map((item) => (
            <label
              key={("experience_index" in item ? item.experience_index : item.project_index).toString()}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${selected.has("experience_index" in item ? item.experience_index : item.project_index)
                ? "border-red-200 bg-red-50"
                : "border-slate-200 bg-white hover:border-slate-300"
                }`}
            >
              <input
                type="checkbox"
                checked={selected.has("experience_index" in item ? item.experience_index : item.project_index)}
                onChange={() => onToggle("experience_index" in item ? item.experience_index : item.project_index)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-[#C1121F] focus:ring-[#C1121F]"
              />
              <div className="min-w-0 flex-1">
                {renderItem(item)}
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${item.auto_selected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                >
                  {item.score.toFixed(1)} {item.auto_selected ? "(auto)" : ""}
                </span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function StaticSection({
  title,
  content,
}: {
  title: string;
  content: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-t-xl border-b border-slate-100 bg-slate-50 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="p-4 text-sm leading-6 text-slate-600">{content}</div>}
    </div>
  );
}

function SortableRow({ id, label, sub }: { id: number; label: string; sub?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
      <button {...attributes} {...listeners} className="cursor-grab text-slate-400 hover:text-slate-600">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

function OrderPanel({
  title, order, itemsByIndex, onReorder,
}: {
  title: string;
  order: number[];
  itemsByIndex: Map<number, { label: string; sub?: string }>;
  onReorder: (newOrder: number[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as number);
    const newIndex = order.indexOf(over.id as number);
    onReorder(arrayMove(order, oldIndex, newIndex));
  };

  if (order.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {order.map((idx) => {
              const info = itemsByIndex.get(idx);
              return <SortableRow key={idx} id={idx} label={info?.label ?? `#${idx}`} sub={info?.sub} />;
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function ReviewStep({
  selection,
  missionText,
  onBack,
  onGenerate,
}: {
  selection: SelectionEntry[];
  missionText: string;
  onBack: () => void;
  onGenerate: (selections: Record<string, { selected_experience_indices: number[]; selected_project_indices: number[] }>) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Map<string, RankedResponse>>(new Map());
  const [error, setError] = useState("");
  const [selections, setSelections] = useState<Record<string, { selected_experience_indices: number[]; selected_project_indices: number[] }>>({});

  const activeData = activeId ? data.get(activeId) : null;

  const expByIndex = useMemo(() => {
    const m = new Map<number, { label: string; sub?: string }>();
    activeData?.experiences.forEach((e) => {
      const raw = ("item" in e ? e.item : {}) as Record<string, unknown>;
      m.set(e.experience_index, { label: String(raw.title || raw.name || ""), sub: String(raw.company || "") });
    });
    return m;
  }, [activeData]);

  const projByIndex = useMemo(() => {
    const m = new Map<number, { label: string }>();
    activeData?.projects.forEach((p) => {
      const raw = ("item" in p ? p.item : {}) as Record<string, unknown>;
      m.set(p.project_index, { label: String(raw.name || "") });
    });
    return m;
  }, [activeData]);

  const reorderSelection = useCallback(
    (candidateId: string, kind: "experience" | "project", newOrder: number[]) => {
      setSelections((prev) => {
        const next = { ...prev };
        const current = next[candidateId] || { selected_experience_indices: [], selected_project_indices: [] };
        const key = kind === "experience" ? "selected_experience_indices" : "selected_project_indices";
        next[candidateId] = { ...current, [key]: newOrder };
        return next;
      });
    },
    []
  );

  const loadForCandidate = async (candidateId: string): Promise<void> => {
    if (data.has(candidateId)) {
      setActiveId(candidateId);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await getRankedExperiencesAndProjects(candidateId, missionText);
      setData((prev) => {
        const next = new Map(prev);
        next.set(candidateId, res);
        return next;
      });
      setActiveId(candidateId);
      setSelections((prev) => {
        const next = { ...prev };
        if (!next[candidateId]) {
          next[candidateId] = {
            selected_experience_indices: res.experiences.filter((e) => e.auto_selected).map((e) => e.experience_index),
            selected_project_indices: res.projects.filter((p) => p.auto_selected).map((p) => p.project_index),
          };
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load experiences");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selection.length > 0 && !activeId) {
      setActiveId(selection[0].candidate_id);
      loadForCandidate(selection[0].candidate_id);
    }
  }, [selection]);

  const toggleAllIdx = useCallback(
    (candidateId: string, kind: "experience" | "project", items: (ExperienceItem | ProjectItem)[], currentlyAllSelected: boolean) => {
      setSelections((prev) => {
        const next = { ...prev };
        const current = next[candidateId] || { selected_experience_indices: [], selected_project_indices: [] };
        const key = kind === "experience" ? "selected_experience_indices" : "selected_project_indices";
        const allIndices = items.map((item) =>
          "experience_index" in item ? item.experience_index : item.project_index
        );
        next[candidateId] = {
          ...current,
          [key]: currentlyAllSelected ? [] : allIndices,
        };
        return next;
      });
    },
    []
  );

  const toggleIdx = useCallback(
    (candidateId: string, kind: "experience" | "project", idx: number) => {
      setSelections((prev) => {
        const next = { ...prev };
        const current = next[candidateId] || { selected_experience_indices: [], selected_project_indices: [] };
        const key = kind === "experience" ? "selected_experience_indices" : "selected_project_indices";
        const arr = current[key] as number[];
        const set = new Set(arr);
        if (set.has(idx)) set.delete(idx);
        else set.add(idx);
        next[candidateId] = { ...current, [key]: Array.from(set) };
        return next;
      });
    },
    []
  );

  const renderExp = (item: ExperienceItem | ProjectItem) => {
    const raw = ("item" in item ? item.item : {}) as Record<string, unknown>;
    return (
      <div>
        <p className="text-sm font-semibold">{String(raw.title || raw.name || "")}</p>
        <p className="text-xs text-slate-500">{String(raw.company || "")} · {String(raw.dates || "")}</p>
        <p className="mt-1 text-xs text-slate-600">{String(raw.description || "")}</p>
      </div>
    );
  };

  const renderProj = (item: ExperienceItem | ProjectItem) => {
    const raw = ("item" in item ? item.item : {}) as Record<string, unknown>;
    return (
      <div>
        <p className="text-sm font-semibold">{String(raw.name || "")}</p>
        <p className="mt-1 text-xs text-slate-600">{String(raw.description || "")}</p>
      </div>
    );
  };

  return (
    <section className="panel p-6">
      <p className="label">Step 3 — Review Ranked Experiences</p>
      <h2 className="mt-2 text-lg font-bold">Review & Confirm Selections</h2>
      <p className="mt-1 text-sm text-slate-500">Items above the threshold are pre-checked. Adjust per candidate.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {selection.map((s) => (
          <button
            key={s.candidate_id}
            onClick={() => loadForCandidate(s.candidate_id)}
            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${activeId === s.candidate_id
              ? "border-[#C1121F] bg-red-50 text-[#C1121F]"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-sm text-red-600">
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {loading && (
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading experiences and projects…
        </div>
      )}

      {activeData && activeId && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3">
            <Section
              title="Experiences"
              items={activeData.experiences}
              selected={new Set((selections[activeId]?.selected_experience_indices || []))}
              onToggle={(idx) => toggleIdx(activeId, "experience", idx)}
              onToggleAll={(allSelected) => toggleAllIdx(activeId, "experience", activeData.experiences, allSelected)}
              renderItem={renderExp}
            />
            <Section
              title="Projects"
              items={activeData.projects}
              selected={new Set((selections[activeId]?.selected_project_indices || []))}
              onToggle={(idx) => toggleIdx(activeId, "project", idx)}
              onToggleAll={(allSelected) => toggleAllIdx(activeId, "project", activeData.projects, allSelected)}
              renderItem={renderProj}
            />
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <div className="flex items-center gap-1 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" /> Note
              </div>
              <p className="mt-1">Experience/project data is fetched per candidate. Ensure your mission text is accurate before generating.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold">Mission text</p>
              <p className="mt-1 line-clamp-4">{missionText}</p>
            </div>
            {activeId && (
              <>
                <OrderPanel
                  title="Ordre des expériences (glisser pour réordonner)"
                  order={selections[activeId]?.selected_experience_indices || []}
                  itemsByIndex={expByIndex}
                  onReorder={(newOrder) => reorderSelection(activeId, "experience", newOrder)}
                />
                <OrderPanel
                  title="Ordre des projets (glisser pour réordonner)"
                  order={selections[activeId]?.selected_project_indices || []}
                  itemsByIndex={projByIndex}
                  onReorder={(newOrder) => reorderSelection(activeId, "project", newOrder)}
                />
              </>
            )}
          </div>
        </div>
      )}

<div className="mt-6 flex items-center justify-between">
  <button onClick={onBack} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">
    Back
  </button>
  <button
    onClick={() => onGenerate(selections)}
    disabled={!activeId || Object.keys(selections).length === 0}
    className="rounded-xl bg-[#C1121F] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-70"
  >
    Generate Adapted CV
  </button>
</div>
    </section >
  );
}
