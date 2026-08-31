import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, Clock, Download, Dumbbell, MapPin, Plus, Save, TriangleAlert, X } from "lucide-react";
import type { ClubAccount } from "./clubTypes";
import type { StoreRow, CoordinatorTrainingSlotInput, CoordinatorTrainingExceptionInput } from "./api";
import { clubApi, getStored } from "./api";
import type { AgendaEvent, TrainingAgendaEvent } from "./AgendaView";
import { FieldZoneMap, TRAINING_FIELDS, fieldZoneLabel, type TrainingFieldId } from "./fieldZones";
import { drawMagicPdfHeader, getClubCrestDataUrl, getDailyFootballPhrase, pdfBrand } from "./pdfBranding";

const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const SHORT_DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const TEAM_COLORS = ["#1976d2", "#7b4bc4", "#087a59", "#d46a13", "#c13f5a", "#137f94", "#6c7a17", "#a54887"];
const PDF_MARGIN = 7;
const PDF_WIDTH = 297;
const PDF_HEIGHT = 210;

type TimeRange = "all" | "morning" | "afternoon";
type TrainingWithCoach = TrainingAgendaEvent & { coach: ClubAccount };

function isoDate(date: Date) {
  const year = date.getFullYear();
  return `${year}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function teamColor(coachId: string) {
  let value = 0;
  for (const character of coachId) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return TEAM_COLORS[value % TEAM_COLORS.length];
}

function newSlot(weekday = 2): CoordinatorTrainingSlotInput {
  return { weekday, startTime: "18:00", endTime: "19:30", fieldId: "el-morer", zoneIds: [], notes: "" };
}

function compactTrainingLabel(event: TrainingAgendaEvent) {
  const status =
    event.exceptionStatus === "holiday" ? "Festivo" :
    event.exceptionStatus === "cancelled" ? "Cancelado" :
    "";
  const time = `${event.startTime || "--:--"}-${event.endTime || "--:--"}`;
  const place = [event.fieldName, fieldZoneLabel(event.fieldId, event.zoneIds)]
    .filter(Boolean)
    .join(" ");
  return [status || time, place].filter(Boolean).join(" · ");
}

export function CoordinatorTrainingPlanner({
  coaches,
  stores,
  selectedCoachId,
  onSelectCoach,
  onRefresh,
  formOpen,
  onFormOpenChange,
  onExportMatches,
  exportingMatches = false,
  hideCommand = false,
}: {
  coaches: ClubAccount[];
  stores: StoreRow[];
  selectedCoachId: string;
  onSelectCoach: (id: string) => void;
  onRefresh: () => Promise<void>;
  formOpen?: boolean;
  onFormOpenChange?: (open: boolean) => void;
  onExportMatches?: () => void;
  exportingMatches?: boolean;
  hideCommand?: boolean;
}) {
  const today = new Date();
  const [week, setWeek] = useState(() => startOfWeek(today));
  const [range, setRange] = useState<TimeRange>("afternoon");
  const [internalFormOpen, setInternalFormOpen] = useState(false);
  const [formCoachId, setFormCoachId] = useState(selectedCoachId === "all" ? "" : selectedCoachId);
  const [fromDate, setFromDate] = useState(isoDate(today));
  const [toDate, setToDate] = useState(() => isoDate(addDays(today, 300)));
  const [slots, setSlots] = useState<CoordinatorTrainingSlotInput[]>([newSlot(2), newSlot(4)]);
  const [editing, setEditing] = useState<TrainingWithCoach | null>(null);
  const [editDraft, setEditDraft] = useState<CoordinatorTrainingExceptionInput | null>(null);
  const [batchDate, setBatchDate] = useState("");
  const [batchSelection, setBatchSelection] = useState<Set<string>>(() => new Set());
  const [batchStatus, setBatchStatus] = useState<CoordinatorTrainingExceptionInput["exceptionStatus"]>("cancelled");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const showForm = formOpen ?? internalFormOpen;
  const setShowForm = (open: boolean) => {
    if (onFormOpenChange) onFormOpenChange(open);
    else setInternalFormOpen(open);
  };
  useEffect(() => {
    if (formOpen) setFormCoachId(selectedCoachId === "all" ? "" : selectedCoachId);
  }, [formOpen, selectedCoachId]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(week, index)), [week]);
  const firstHour = range === "afternoon" ? 15 : 8;
  const lastHour = range === "morning" ? 15 : 23;
  const selectedCoach = selectedCoachId === "all"
    ? undefined
    : coaches.find((coach) => coach.id === selectedCoachId);
  const displayedCoaches = selectedCoach ? [selectedCoach] : coaches;
  const allTrainings = useMemo(() => coaches.flatMap((coach) =>
    getStored<AgendaEvent[]>(stores, coach.id, "agenda", [])
      .filter((event): event is TrainingAgendaEvent => event.type === "training" && event.assignedByCoordinator === true)
      .map((event) => ({ ...event, coach }))), [coaches, stores]);
  const visibleTrainings = allTrainings.filter((event) =>
    (selectedCoachId === "all" || event.coach.id === selectedCoachId) &&
    event.date >= isoDate(weekDays[0]) && event.date <= isoDate(weekDays[6]) &&
    minutes(event.endTime) > firstHour * 60 && minutes(event.startTime) < lastHour * 60);

  const hasConflict = (event: TrainingWithCoach) => allTrainings.some((other) =>
    other.id !== event.id && other.coach.id !== event.coach.id && other.date === event.date &&
    other.fieldId === event.fieldId && other.exceptionStatus !== "cancelled" && other.exceptionStatus !== "holiday" &&
    minutes(other.startTime) < minutes(event.endTime) && minutes(event.startTime) < minutes(other.endTime) &&
    (event.zoneIds || []).some((zone) => (other.zoneIds || []).includes(zone)));

  const updateSlot = (index: number, changes: Partial<CoordinatorTrainingSlotInput>) => {
    setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...changes } : slot));
  };

  const saveSeries = async () => {
    const accountId = formCoachId || (selectedCoachId !== "all" ? selectedCoachId : "");
    if (!accountId || !fromDate || !toDate || fromDate > toDate || slots.some((slot) => !slot.zoneIds.length || slot.startTime >= slot.endTime)) {
      setMessage("Selecciona equipo, periodo, horarios y al menos una zona para cada día.");
      return;
    }
    setBusy(true);
    try {
      await clubApi.assignCoordinatorTraining(accountId, { fromDate, toDate, slots });
      await onRefresh();
      onSelectCoach(accountId);
      setShowForm(false);
      setMessage("Horario habitual guardado en la agenda del entrenador.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el horario.");
    } finally {
      setBusy(false);
    }
  };

  const openException = (event: TrainingWithCoach) => {
    setEditing(event);
    setEditDraft({
      startTime: event.startTime,
      endTime: event.endTime,
      fieldId: (event.fieldId || "el-morer") as TrainingFieldId,
      zoneIds: event.zoneIds || [],
      notes: event.notes || "",
      exceptionStatus: event.exceptionStatus || "scheduled",
    });
  };

  const saveException = async () => {
    if (!editing || !editDraft || editDraft.startTime >= editDraft.endTime || !editDraft.zoneIds.length) return;
    setBusy(true);
    try {
      await clubApi.updateCoordinatorTrainingOccurrence(editing.coach.id, editing.id, editDraft);
      await onRefresh();
      setEditing(null);
      setEditDraft(null);
      setMessage("Excepción guardada únicamente para ese día.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la excepción.");
    } finally {
      setBusy(false);
    }
  };

  const openBatchEditor = (date: string) => {
    const events = allTrainings.filter((event) =>
      event.date === date && (selectedCoachId === "all" || event.coach.id === selectedCoachId));
    setBatchDate(date);
    setBatchSelection(new Set(events.map((event) => `${event.coach.id}:${event.id}`)));
    setBatchStatus("cancelled");
  };

  const batchEvents = batchDate
    ? allTrainings.filter((event) => event.date === batchDate && (selectedCoachId === "all" || event.coach.id === selectedCoachId))
    : [];

  const saveBatchStatus = async () => {
    const selections = batchEvents
      .filter((event) => batchSelection.has(`${event.coach.id}:${event.id}`))
      .map((event) => ({ accountId: event.coach.id, eventId: event.id }));
    if (!selections.length) return;
    setBusy(true);
    try {
      const result = await clubApi.updateCoordinatorTrainingStatus(selections, batchStatus);
      await onRefresh();
      setBatchDate("");
      setBatchSelection(new Set());
      setMessage(`${result.updated} entrenamiento${result.updated === 1 ? "" : "s"} actualizado${result.updated === 1 ? "" : "s"} para ese día.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron actualizar los entrenamientos.");
    } finally {
      setBusy(false);
    }
  };

  const exportQuadrantPdf = async () => {
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      const coachesToExport = selectedCoach ? [selectedCoach] : coaches;
      const tableLeft = PDF_MARGIN;
      const tableTop = 38;
      const teamColumnWidth = 34;
      const dayColumnWidth = (PDF_WIDTH - PDF_MARGIN * 2 - teamColumnWidth) / 7;
      const headerHeight = 8.8;
      const footerY = PDF_HEIGHT - 7;
      const availableRowsHeight = footerY - tableTop - headerHeight - 4;
      const rowHeight = coachesToExport.length
        ? Math.min(12, availableRowsHeight / coachesToExport.length)
        : 12;
      const fontSize = rowHeight < 6 ? 4.3 : rowHeight < 8 ? 5 : 5.9;
      const headerFontSize = 6.4;

      const clean = (value: string) => value.replace(/\s+/g, " ").trim();
      const fitText = (value: string, maxWidth: number, size = fontSize) => {
        const text = clean(value);
        doc.setFontSize(size);
        if (doc.getTextWidth(text) <= maxWidth) return text;
        let start = 0;
        let end = text.length;
        while (start < end) {
          const middle = Math.ceil((start + end) / 2);
          if (doc.getTextWidth(`${text.slice(0, middle)}...`) <= maxWidth) start = middle;
          else end = middle - 1;
        }
        return `${text.slice(0, Math.max(1, start)).trim()}...`;
      };
      const weekLabel = `${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" }).format(weekDays[0])} - ${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(weekDays[6])}`;
      const periodLabel = `Semana del ${weekLabel}`;
      const scopeLabel = selectedCoach ? selectedCoach.teamLabel : "Todos los equipos";
      drawMagicPdfHeader(doc, {
        title: "Cuadrante de entrenamientos",
        period: periodLabel,
        scope: scopeLabel,
        phrase: getDailyFootballPhrase(isoDate(weekDays[0])),
        crestDataUrl: await getClubCrestDataUrl(),
        width: PDF_WIDTH,
        margin: PDF_MARGIN,
      });

      doc.setDrawColor(...pdfBrand.border);
      doc.setFillColor(225, 241, 251);
      doc.rect(tableLeft, tableTop, teamColumnWidth, headerHeight, "FD");
      doc.setTextColor(...pdfBrand.ink);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(headerFontSize);
      doc.text("Equipo", tableLeft + 2.5, tableTop + 5.9);
      weekDays.forEach((day, index) => {
        const x = tableLeft + teamColumnWidth + index * dayColumnWidth;
        doc.setFillColor(225, 241, 251);
        doc.rect(x, tableTop, dayColumnWidth, headerHeight, "FD");
        doc.text(`${SHORT_DAY_LABELS[day.getDay()]} ${day.getDate()}`, x + dayColumnWidth / 2, tableTop + 5.9, { align: "center" });
      });

      coachesToExport.forEach((coach, rowIndex) => {
        const y = tableTop + headerHeight + rowIndex * rowHeight;
        const rowTrainings = allTrainings.filter((event) =>
          event.coach.id === coach.id &&
          event.date >= isoDate(weekDays[0]) &&
          event.date <= isoDate(weekDays[6]));

        doc.setDrawColor(216, 226, 237);
        doc.setFillColor(rowIndex % 2 === 0 ? 255 : 248, rowIndex % 2 === 0 ? 255 : 251, rowIndex % 2 === 0 ? 255 : 254);
        doc.rect(tableLeft, y, teamColumnWidth, rowHeight, "FD");
        doc.setTextColor(...pdfBrand.ink);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(fontSize);
        doc.text(fitText(coach.teamLabel, teamColumnWidth - 5), tableLeft + 2.5, y + rowHeight / 2 + fontSize * 0.32);

        weekDays.forEach((day, dayIndex) => {
          const date = isoDate(day);
          const x = tableLeft + teamColumnWidth + dayIndex * dayColumnWidth;
          const dayTrainings = rowTrainings
            .filter((event) => event.date === date)
            .sort((first, second) => first.startTime.localeCompare(second.startTime));
          const hasTraining = dayTrainings.length > 0;
          doc.setFillColor(hasTraining ? 232 : rowIndex % 2 === 0 ? 255 : 248, hasTraining ? 247 : rowIndex % 2 === 0 ? 255 : 251, hasTraining ? 239 : rowIndex % 2 === 0 ? 255 : 254);
          doc.rect(x, y, dayColumnWidth, rowHeight, "FD");
          doc.setTextColor(hasTraining ? 8 : 116, hasTraining ? 116 : 130, hasTraining ? 82 : 145);
          doc.setFont("helvetica", hasTraining ? "bold" : "normal");
          const content = hasTraining
            ? dayTrainings.map(compactTrainingLabel).join(" / ")
            : "-";
          doc.text(fitText(content, dayColumnWidth - 4, fontSize), x + 2, y + rowHeight / 2 + fontSize * 0.32);
        });
      });

      doc.setDrawColor(...pdfBrand.border);
      doc.line(PDF_MARGIN, footerY - 3, PDF_WIDTH - PDF_MARGIN, footerY - 3);
      doc.setTextColor(...pdfBrand.muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.2);
      doc.text("Una fila por equipo. Las actividades del mismo dia se agrupan en la misma celda.", PDF_MARGIN, footerY);
      doc.text("Pagina 1 de 1", PDF_WIDTH - PDF_MARGIN, footerY, { align: "right" });
      doc.save(`cuadrante-entrenamientos-${isoDate(weekDays[0])}.pdf`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo exportar el cuadrante.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="training-planner">
      {!hideCommand && <section className="training-planner-command">
        <div><span><Dumbbell size={15} /> PLANIFICACIÓN DE ENTRENAMIENTOS</span><strong>Horarios habituales y excepciones</strong><small>Crea la rutina semanal una vez y modifica únicamente los días que cambien.</small></div>
        <button type="button" onClick={() => { setFormCoachId(selectedCoachId === "all" ? "" : selectedCoachId); setShowForm(true); setMessage(""); }}><Plus size={17} /> Añadir entrenamiento</button>
      </section>}
      {message && <div className="coordinator-match-message" role="status">{message}</div>}

      {showForm && (
        <section className="training-series-form">
          <header><div><span>NUEVO HORARIO HABITUAL</span><h3>Planificación semanal</h3><small>Configura tantos días como necesite el equipo.</small></div><button type="button" aria-label="Cerrar formulario" onClick={() => setShowForm(false)}><X size={18} /></button></header>
          <div className="training-series-range">
            <label><span>Equipo</span><select value={formCoachId} onChange={(event) => setFormCoachId(event.target.value)}><option value="">Selecciona equipo</option>{coaches.map((coach) => <option value={coach.id} key={coach.id}>{coach.teamLabel} · {coach.name}</option>)}</select></label>
            <label><span>Desde</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
            <label><span>Hasta</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
          </div>
          <div className="training-slot-list">
            {slots.map((slot, index) => (
              <article key={index}>
                <div className="training-slot-heading"><strong>Día habitual {index + 1}</strong>{slots.length > 1 && <button type="button" onClick={() => setSlots((current) => current.filter((_, slotIndex) => slotIndex !== index))}>Quitar</button>}</div>
                <div className="training-slot-fields">
                  <label><span>Día</span><select value={slot.weekday} onChange={(event) => updateSlot(index, { weekday: Number(event.target.value) })}>{DAY_LABELS.slice(1, 7).map((label, dayIndex) => <option value={dayIndex + 1} key={label}>{label}</option>)}</select></label>
                  <label><span>Empieza</span><input type="time" value={slot.startTime} onChange={(event) => updateSlot(index, { startTime: event.target.value })} /></label>
                  <label><span>Termina</span><input type="time" value={slot.endTime} onChange={(event) => updateSlot(index, { endTime: event.target.value })} /></label>
                  <label><span>Campo</span><select value={slot.fieldId} onChange={(event) => updateSlot(index, { fieldId: event.target.value as TrainingFieldId, zoneIds: [] })}>{TRAINING_FIELDS.map((field) => <option value={field.id} key={field.id}>{field.label}</option>)}</select></label>
                </div>
                <div className="training-zone-section"><div><strong>Selecciona la zona</strong><small>Pulsa una o varias partes del campo.</small></div><FieldZoneMap fieldId={slot.fieldId} selectedZoneIds={slot.zoneIds} onChange={(zoneIds) => updateSlot(index, { zoneIds })} /></div>
                <label className="training-slot-notes"><span>Observaciones de este día</span><textarea rows={2} value={slot.notes} onChange={(event) => updateSlot(index, { notes: event.target.value })} placeholder="Opcional" /></label>
              </article>
            ))}
          </div>
          <footer><button type="button" className="secondary-button" onClick={() => setSlots((current) => [...current, newSlot(current.length ? Math.min(6, current[current.length - 1].weekday + 1) : 2)])}><Plus size={16} /> Añadir otro día</button><button type="button" className="primary-button" disabled={busy} onClick={() => void saveSeries()}><Save size={16} /> {busy ? "Guardando…" : "Guardar horario habitual"}</button></footer>
        </section>
      )}

      <section className="training-week-calendar">
        <header className="training-week-toolbar">
          <div className="training-week-navigation"><button type="button" aria-label="Semana anterior" onClick={() => setWeek((current) => addDays(current, -7))}><ChevronLeft size={18} /></button><button type="button" onClick={() => setWeek(startOfWeek(new Date()))}>Hoy</button><button type="button" aria-label="Semana siguiente" onClick={() => setWeek((current) => addDays(current, 7))}><ChevronRight size={18} /></button></div>
          <div><span>SEMANA</span><h3>{new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" }).format(weekDays[0])} – {new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(weekDays[6])}</h3></div>
          <div className="training-time-range">{([ ["all", "Todo"], ["morning", "Mañana"], ["afternoon", "Tarde"] ] as const).map(([value, label]) => <button type="button" className={range === value ? "active" : ""} key={value} onClick={() => setRange(value)}>{label}</button>)}</div>
          <div className="training-export-actions">
            <button type="button" className="training-export-button" disabled={exporting} onClick={() => void exportQuadrantPdf()}><Download size={15} /> {exporting ? "Exportando..." : "Exportar entrenes"}</button>
            {onExportMatches && <button type="button" className="training-export-button matches" disabled={exportingMatches} onClick={onExportMatches}><Download size={15} /> {exportingMatches ? "Exportando..." : "Exportar partidos"}</button>}
          </div>
        </header>
        <div className="training-team-calendar">
          <div className="training-team-calendar-header">
            <div className="training-team-calendar-corner"><Clock size={14} /> Equipo</div>
            {weekDays.map((day) => {
              const date = isoDate(day);
              const count = allTrainings.filter((event) => event.date === date && (selectedCoachId === "all" || event.coach.id === selectedCoachId)).length;
              return <div className={`training-week-day-title${date === isoDate(today) ? " today" : ""}`} key={date}><span>{SHORT_DAY_LABELS[day.getDay()]}</span><strong>{day.getDate()}</strong>{count > 0 && <button type="button" onClick={() => openBatchEditor(date)} title="Gestionar todos los entrenamientos de este día"><CalendarCheck size={11} /> Gestionar</button>}</div>;
            })}
          </div>
          <div className="training-team-calendar-body">
            {displayedCoaches.map((coach) => (
              <div className="training-team-calendar-row" key={coach.id}>
                <div className="training-team-name" style={{ "--team-color": teamColor(coach.id) } as CSSProperties}><i /><span><strong>{coach.teamLabel}</strong><small>{coach.name}</small></span></div>
                {weekDays.map((day) => {
                  const date = isoDate(day);
                  const events = visibleTrainings.filter((event) => event.coach.id === coach.id && event.date === date);
                  return <div className="training-team-day-cell" key={date}>
                    {events.length ? events.map((event) => {
                      const conflict = hasConflict(event);
                      const cancelled = event.exceptionStatus === "holiday" || event.exceptionStatus === "cancelled";
                      return <button type="button" className={`training-team-event${conflict ? " conflict" : ""}${cancelled ? " cancelled" : ""}`} style={{ "--team-color": teamColor(event.coach.id) } as CSSProperties} key={event.id} onClick={() => openException(event)} title="Editar únicamente este día"><span>{cancelled ? event.exceptionStatus === "holiday" ? "Festivo" : "Cancelado" : `${event.startTime}–${event.endTime}`}</span><small><MapPin size={10} /> {event.fieldName} · {fieldZoneLabel(event.fieldId, event.zoneIds)}</small>{conflict && <em><TriangleAlert size={10} /> Coincidencia</em>}</button>;
                    }) : <span className="training-team-empty">—</span>}
                  </div>;
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {editing && editDraft && (
        <div className="training-exception-backdrop" role="presentation" onMouseDown={() => setEditing(null)}>
          <section className="training-exception-dialog" role="dialog" aria-modal="true" aria-labelledby="training-exception-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span>EDITAR SOLO ESTE DÍA</span><h3 id="training-exception-title">{editing.coach.teamLabel}</h3><small>{new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${editing.date}T12:00:00`))}</small></div><button type="button" aria-label="Cerrar" onClick={() => setEditing(null)}><X size={18} /></button></header>
            <div className="training-exception-status">{([ ["scheduled", "Entrena"], ["holiday", "Festivo"], ["cancelled", "Cancelado"] ] as const).map(([value, label]) => <button type="button" className={editDraft.exceptionStatus === value ? "active" : ""} key={value} onClick={() => setEditDraft({ ...editDraft, exceptionStatus: value })}>{label}</button>)}</div>
            <div className="training-exception-fields"><label><span>Empieza</span><input type="time" value={editDraft.startTime} onChange={(event) => setEditDraft({ ...editDraft, startTime: event.target.value })} /></label><label><span>Termina</span><input type="time" value={editDraft.endTime} onChange={(event) => setEditDraft({ ...editDraft, endTime: event.target.value })} /></label><label><span>Campo</span><select value={editDraft.fieldId} onChange={(event) => setEditDraft({ ...editDraft, fieldId: event.target.value as TrainingFieldId, zoneIds: [] })}>{TRAINING_FIELDS.map((field) => <option value={field.id} key={field.id}>{field.label}</option>)}</select></label></div>
            <FieldZoneMap fieldId={editDraft.fieldId} selectedZoneIds={editDraft.zoneIds} onChange={(zoneIds) => setEditDraft({ ...editDraft, zoneIds })} />
            <label className="training-slot-notes"><span>Motivo u observaciones</span><textarea rows={2} value={editDraft.notes} onChange={(event) => setEditDraft({ ...editDraft, notes: event.target.value })} placeholder="Ej. Festivo local" /></label>
            <footer><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancelar</button><button type="button" className="primary-button" disabled={busy || !editDraft.zoneIds.length} onClick={() => void saveException()}><Save size={16} /> Guardar solo este día</button></footer>
          </section>
        </div>
      )}
      {batchDate && (
        <div className="training-exception-backdrop" role="presentation" onMouseDown={() => setBatchDate("")}>
          <section className="training-exception-dialog training-batch-dialog" role="dialog" aria-modal="true" aria-labelledby="training-batch-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span>GESTIONAR ENTRENAMIENTOS DEL DÍA</span><h3 id="training-batch-title">{new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${batchDate}T12:00:00`))}</h3><small>Selecciona únicamente los equipos a los que quieres aplicar el cambio.</small></div><button type="button" aria-label="Cerrar" onClick={() => setBatchDate("")}><X size={18} /></button></header>
            <div className="training-batch-selection">
              <div className="training-batch-selection-actions"><button type="button" onClick={() => setBatchSelection(new Set(batchEvents.map((event) => `${event.coach.id}:${event.id}`)))}>Seleccionar todos</button><button type="button" onClick={() => setBatchSelection(new Set())}>Quitar selección</button></div>
              {batchEvents.map((event) => { const key = `${event.coach.id}:${event.id}`; return <label key={key}><input type="checkbox" checked={batchSelection.has(key)} onChange={(change) => setBatchSelection((current) => { const next = new Set(current); if (change.target.checked) next.add(key); else next.delete(key); return next; })} /><span><strong>{event.coach.teamLabel}</strong><small>{event.startTime}–{event.endTime} · {event.fieldName}</small></span></label>; })}
            </div>
            <div className="training-exception-status">{([ ["cancelled", "Cancelar"], ["holiday", "Festivo"], ["scheduled", "Restaurar"] ] as const).map(([value, label]) => <button type="button" className={batchStatus === value ? "active" : ""} key={value} onClick={() => setBatchStatus(value)}>{label}</button>)}</div>
            <footer><button type="button" className="secondary-button" onClick={() => setBatchDate("")}>Volver</button><button type="button" className="primary-button" disabled={busy || batchSelection.size === 0} onClick={() => void saveBatchStatus()}><Save size={16} /> Aplicar a {batchSelection.size} equipo{batchSelection.size === 1 ? "" : "s"}</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}
