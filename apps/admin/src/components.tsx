import type { Actor, Entity } from "../../../packages/shared-types/src";
import type { Field } from "../../../packages/validation/src";
export type Catalog = Record<string, Entity[]>;
export const can = (user: Actor, permission: string) =>
  user.permissions.includes("*") || user.permissions.includes(permission);
export const statusLabels: Record<string, string> = {
  PRESENT: "Hadir",
  LATE: "Terlambat",
  SICK: "Sakit",
  PERMISSION: "Izin",
  ABSENT: "Alpa",
  DRAFT: "Draft",
  REVIEWED: "Direview",
  APPROVED: "Disetujui",
  PUBLISHED: "Terbit",
};
export function label(
  row: Entity | undefined,
  key: string,
  catalog: Catalog,
): string {
  if (!row) return "Data tidak tersedia";
  const related = (field: string, resource: string) =>
    label(
      catalog[resource]?.find((r) => r.id === row[field]),
      resource,
      catalog,
    );
  if (key === "assessment-categories")
    return `${related("class_subject_id", "class-subjects")} · ${row.name}`;
  if (key === "classes" || key === "semesters")
    return `${row.name} · ${related("academic_year_id", "academic-years")}`;
  if (row.name) return String(row.name);
  if (key === "class-subjects")
    return `${related("class_id", "classes")} · ${related("subject_id", "subjects")} · ${related("semester_id", "semesters")}`;
  if (key === "class-students")
    return `${related("class_id", "classes")} · ${related("student_id", "students")}`;
  if (key === "student-guardians")
    return `${related("student_id", "students")} · ${related("parent_id", "parents")}`;
  if (key === "teacher-subjects")
    return `${related("teacher_id", "teachers")} · ${related("subject_id", "subjects")}`;
  if (key === "timetables")
    return `${related("class_subject_id", "class-subjects")} · ${row.start_time}`;
  return row.id.slice(0, 8);
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="notice error" role="alert">
      {error}
    </div>
  ) : null;
}
export function Empty({
  text = "Belum ada data. Tambahkan data pertama untuk memulai.",
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">▤</span>
      <p>{text}</p>
    </div>
  );
}
export function Select({
  title,
  value,
  onChange,
  rows,
  resource,
  catalog,
  required = true,
}: {
  title: string;
  value: string;
  onChange: (s: string) => void;
  rows: Entity[];
  resource: string;
  catalog: Catalog;
  required?: boolean;
}) {
  return (
    <label>
      {title}
      <select
        aria-label={title}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Pilih {title.toLowerCase()}</option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {label(row, resource, catalog)}
          </option>
        ))}
      </select>
    </label>
  );
}
export function FieldInput({
  field,
  value,
  onChange,
  catalog,
  disabled = false,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
  catalog: Catalog;
  disabled?: boolean;
}) {
  if (field.type === "checkbox")
    return (
      <label className="check">
        <input
          disabled={disabled}
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        {field.label}
      </label>
    );
  if (field.type === "select")
    return (
      <label>
        {field.label}
        {!field.optional && " *"}
        <select
          aria-label={field.label}
          disabled={disabled}
          required={!field.optional}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Pilih {field.label.toLowerCase()}</option>
          {field.resource
            ? (catalog[field.resource] || []).map((r) => (
                <option key={r.id} value={r.id}>
                  {label(r, field.resource!, catalog)}
                </option>
              ))
            : field.options?.map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
    );
  return (
    <label>
      {field.label}
      {!field.optional && " *"}
      <input
        aria-label={field.label}
        disabled={disabled}
        type={field.type || "text"}
        required={!field.optional}
        value={value ?? ""}
        min={field.min}
        max={field.max}
        step={field.type === "number" ? "any" : undefined}
        onChange={(e) =>
          onChange(
            field.type === "number" && e.target.value !== ""
              ? Number(e.target.value)
              : e.target.value,
          )
        }
      />
    </label>
  );
}
