import React, { Children, Fragment, isValidElement, useState } from "react";
import "./sortable-table.css";
export type TableSort = {
  column: number;
  direction: "ascending" | "descending";
} | null;
type Element = React.ReactElement<any>;
function elements(children: React.ReactNode): Element[] {
  return Children.toArray(children).flatMap((child) =>
    isValidElement(child)
      ? child.type === Fragment
        ? elements((child as Element).props.children)
        : [child as Element]
      : [],
  );
}
function cellText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(cellText).join(" ");
  if (!isValidElement(node)) return "";
  const { props, type } = node as Element;
  if (props["data-sort-value"] !== undefined)
    return String(props["data-sort-value"] ?? "");
  if (["button", "svg"].includes(String(type))) return "";
  if (type === "input" || type === "select")
    return String(props.value ?? props.defaultValue ?? "");
  return cellText(props.children ?? props.value ?? props.label ?? "");
}
function hasAction(node: React.ReactNode): boolean {
  return Children.toArray(node).some((child) => {
    if (!isValidElement(child)) return false;
    const element = child as Element;
    return (
      element.type === "button" ||
      (element.type === "input" &&
        ["checkbox", "radio"].includes(element.props.type)) ||
      hasAction(element.props.children)
    );
  });
}
function sortValue(node: React.ReactNode): string | number {
  if (typeof node === "number") return node;
  if (isValidElement(node)) {
    const props = (node as Element).props;
    if (props["data-sort-value"] !== undefined)
      return props["data-sort-value"] ?? "";
    if (!Array.isArray(props.children) && props.children != null)
      return sortValue(props.children);
  }
  return cellText(node);
}
const collator = new Intl.Collator("id", {
  numeric: true,
  sensitivity: "base",
});
const weekdays = [
  "senin",
  "selasa",
  "rabu",
  "kamis",
  "jumat",
  "sabtu",
  "minggu",
];
function comparable(text: string): string | number {
  const value = text.trim().replace(/\s+/g, " ");
  const day = weekdays.indexOf(value.toLowerCase());
  if (day >= 0) return day;
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) return Date.parse(value);
  const date = value.match(
    /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:,?\s+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?)?$/,
  );
  if (date)
    return Date.UTC(
      +date[3],
      +date[2] - 1,
      +date[1],
      +(date[4] || 0),
      +(date[5] || 0),
      +(date[6] || 0),
    );
  const monthNames = [
    "jan",
    "feb",
    "mar",
    "apr",
    "mei",
    "jun",
    "jul",
    "agu",
    "sep",
    "okt",
    "nov",
    "des",
  ];
  const namedDate = value.toLowerCase().match(/^(\d{1,2}) ([a-z]+) (\d{4})$/);
  if (namedDate) {
    const month = monthNames.findIndex((m) => namedDate[2].startsWith(m));
    if (month >= 0) return Date.UTC(+namedDate[3], month, +namedDate[1]);
  }
  const number = value
    .replace(/^Rp\.?\s*/i, "")
    .replace(/\s*(%|jam|menit|akun|siswa|bobot)$/, "");
  if (/^-?\d+(?:\.\d{3})+(?:,\d+)?$/.test(number) || /^-?\d+,\d+$/.test(number))
    return Number(number.replaceAll(".", "").replace(",", "."));
  if (/^-?\d+(?:\.\d+)?$/.test(number)) return Number(number);
  return value;
}
function compare(a: string | number, b: string | number, direction: string) {
  const empty = (value: string | number) =>
    !String(value).trim() || ["\u2014", "-"].includes(String(value).trim());
  if (empty(a) || empty(b)) return Number(empty(a)) - Number(empty(b));
  const av = typeof a === "number" ? a : comparable(a),
    bv = typeof b === "number" ? b : comparable(b);
  return (
    (typeof av === "number" && typeof bv === "number"
      ? av - bv
      : collator.compare(String(a), String(b))) *
    (direction === "descending" ? -1 : 1)
  );
}
export function SortableTable({
  children,
  sort,
  onSortChange,
  rowOffset = 0,
  rowLimit,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & {
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  rowOffset?: number;
  rowLimit?: number;
}) {
  const [internalSort, setInternalSort] = useState<{
    value: TableSort;
    signature: string;
  }>({ value: null, signature: "" });
  const sections = elements(children);
  const signature = sections
    .filter((s) => s.type === "thead")
    .map(cellText)
    .join("|");
  const selected =
    sort === undefined
      ? internalSort.signature === signature
        ? internalSort.value
        : null
      : sort;
  const bodies = sections.filter((s) => s.type === "tbody");
  const rows = bodies.flatMap((b) => elements(b.props.children));
  const cells = (row: Element) => elements(row.props.children);
  const sortable = (header: Element, column: number) => {
    if (
      header.props["data-sortable"] === false ||
      header.props.colSpan > 1 ||
      /^(aksi|actions?|pilih)$/i.test(cellText(header).trim())
    )
      return false;
    const values = rows
      .filter((r) => !cells(r).some((c) => c.props.colSpan > 1))
      .map((r) => cells(r)[column])
      .filter(Boolean);
    // Empty columns remain available; columns containing only controls do not.
    return (
      !values.length ||
      values.some((c) => cellText(c).trim()) ||
      !values.some((c) => hasAction(c))
    );
  };
  const change = (column: number) => {
    const next: TableSort = {
      column,
      direction:
        selected?.column === column && selected.direction === "ascending"
          ? "descending"
          : "ascending",
    };
    setInternalSort({ value: next, signature });
    onSortChange?.(next);
  };
  return (
    <table {...props}>
      {sections.map((section, index) => {
        if (section.type === "thead")
          return React.cloneElement(
            section,
            { key: section.key ?? index },
            elements(section.props.children).map((row, ri) =>
              React.cloneElement(
                row,
                { key: row.key ?? ri },
                cells(row).map((header, column) =>
                  sortable(header, column)
                    ? React.cloneElement(
                        header,
                        {
                          key: header.key ?? column,
                          "aria-sort":
                            selected?.column === column
                              ? selected.direction
                              : "none",
                        },
                        <button
                          type="button"
                          className="table-sort-button"
                          onClick={() => change(column)}
                          title={`Urutkan ${cellText(header).trim()} ${selected?.column === column && selected.direction === "ascending" ? "menurun" : "menaik"}`}
                        >
                          <span>{header.props.children}</span>
                          <span
                            className="table-sort-indicator"
                            aria-hidden="true"
                          >
                            {selected?.column === column
                              ? selected.direction === "ascending"
                                ? "↑"
                                : "↓"
                              : "↕"}
                          </span>
                        </button>,
                      )
                    : header,
                ),
              ),
            ),
          );
        if (section.type === "tbody") {
          let items = elements(section.props.children);
          if (selected) {
            // Keep empty states and section/summary rows in their original positions.
            const data = items.filter(
              (r) => !cells(r).some((c) => c.props.colSpan > 1),
            );
            data.sort((a, b) =>
              compare(
                sortValue(cells(a)[selected.column]),
                sortValue(cells(b)[selected.column]),
                selected.direction,
              ),
            );
            let cursor = 0;
            items = items.map((r) =>
              cells(r).some((c) => c.props.colSpan > 1) ? r : data[cursor++],
            );
          }
          return React.cloneElement(
            section,
            { key: section.key ?? index },
            items.slice(
              rowOffset,
              rowLimit === undefined ? undefined : rowOffset + rowLimit,
            ),
          );
        }
        return section;
      })}
    </table>
  );
}
