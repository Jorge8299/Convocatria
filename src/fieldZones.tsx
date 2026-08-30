import { MapPin, X } from "lucide-react";

export type TrainingFieldId = "campo-c" | "el-morer" | "polideportivo";

export interface FieldZone {
  id: string;
  label: string;
  points: string;
}

export interface TrainingField {
  id: TrainingFieldId;
  label: string;
  image: string;
  zones: FieldZone[];
}

export const TRAINING_FIELDS: TrainingField[] = [
  {
    id: "campo-c",
    label: "Campo C",
    image: "/fields/campo-c.png",
    zones: [
      { id: "c-1", label: "Zona 1", points: "29,6 67,30 31,61 4,32" },
      { id: "c-2", label: "Zona 2", points: "67,30 95,75 56,92 31,61" },
    ],
  },
  {
    id: "el-morer",
    label: "El Morer",
    image: "/fields/morer.png",
    zones: [
      { id: "m-1", label: "Zona 1", points: "9,31 33,20 48,54 28,65" },
      { id: "m-2", label: "Zona 2", points: "33,20 56,9 69,43 48,54" },
      { id: "m-3", label: "Zona 3", points: "48,54 69,43 89,71 63,89" },
      { id: "m-4", label: "Zona 4", points: "28,65 48,54 63,89 42,96" },
    ],
  },
  {
    id: "polideportivo",
    label: "Polideportivo",
    image: "/fields/poli.png",
    zones: [
      { id: "p-1", label: "Zona 1", points: "21,36 43,27 55,50 36,62" },
      { id: "p-2", label: "Zona 2", points: "43,27 59,21 72,43 55,50" },
      { id: "p-3", label: "Zona 3", points: "55,50 72,43 92,73 70,78" },
      { id: "p-4", label: "Zona 4", points: "36,62 55,50 70,78 51,89" },
    ],
  },
];

export function getTrainingField(fieldId?: string) {
  return TRAINING_FIELDS.find((field) => field.id === fieldId);
}

export function fieldZoneLabel(fieldId?: string, zoneIds: string[] = []) {
  const field = getTrainingField(fieldId);
  if (!field) return "Zona pendiente";
  if (zoneIds.length === field.zones.length) return "Campo completo";
  return field.zones
    .filter((zone) => zoneIds.includes(zone.id))
    .map((zone) => zone.label)
    .join(" y ") || "Zona pendiente";
}

export function FieldZoneMap({
  fieldId,
  selectedZoneIds,
  onChange,
  compact = false,
}: {
  fieldId: string;
  selectedZoneIds: string[];
  onChange?: (zoneIds: string[]) => void;
  compact?: boolean;
}) {
  const field = getTrainingField(fieldId);
  if (!field) return <p className="field-zone-empty">Selecciona un campo para ver sus zonas.</p>;
  const allSelected = field.zones.every((zone) => selectedZoneIds.includes(zone.id));
  const toggleZone = (zoneId: string) => {
    if (!onChange) return;
    onChange(selectedZoneIds.includes(zoneId)
      ? selectedZoneIds.filter((id) => id !== zoneId)
      : [...selectedZoneIds, zoneId]);
  };
  return (
    <div className={`field-zone-picker${compact ? " compact" : ""}`}>
      <div className="field-zone-map">
        <img src={field.image} alt={`Plano de ${field.label}`} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`Zonas de ${field.label}`}>
          {field.zones.map((zone) => {
            const selected = selectedZoneIds.includes(zone.id);
            return onChange ? (
              <polygon
                key={zone.id}
                points={zone.points}
                className={selected ? "selected" : ""}
                role="button"
                tabIndex={0}
                aria-label={`${selected ? "Quitar" : "Seleccionar"} ${zone.label}`}
                onClick={() => toggleZone(zone.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleZone(zone.id);
                  }
                }}
              />
            ) : (
              <polygon key={zone.id} points={zone.points} className={selected ? "selected readonly" : "readonly"} />
            );
          })}
        </svg>
      </div>
      {!compact && onChange && (
        <div className="field-zone-controls">
          <button type="button" className={allSelected ? "active" : ""} onClick={() => onChange(allSelected ? [] : field.zones.map((zone) => zone.id))}>Campo completo</button>
          {field.zones.map((zone) => (
            <button type="button" className={selectedZoneIds.includes(zone.id) ? "active" : ""} key={zone.id} onClick={() => toggleZone(zone.id)}>{zone.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FieldZoneDialog({
  fieldId,
  zoneIds,
  onClose,
}: {
  fieldId: string;
  zoneIds: string[];
  onClose: () => void;
}) {
  const field = getTrainingField(fieldId);
  if (!field) return null;
  return (
    <div className="field-zone-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="field-zone-dialog" role="dialog" aria-modal="true" aria-labelledby="field-zone-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span><MapPin size={15} /> ZONA DE ENTRENAMIENTO</span><h3 id="field-zone-title">{field.label}</h3><small>{fieldZoneLabel(fieldId, zoneIds)}</small></div>
          <button type="button" aria-label="Cerrar plano" onClick={onClose}><X size={20} /></button>
        </header>
        <FieldZoneMap fieldId={fieldId} selectedZoneIds={zoneIds} />
      </section>
    </div>
  );
}
