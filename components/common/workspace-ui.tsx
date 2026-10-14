"use client";

import { groupLabel } from "@/lib/domain/seasons";

import { AlertTriangle, CheckCircle2, ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import type { GroupSummary } from "@/lib/domain/types";

export function WorkspaceHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="workspace-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="workspace-actions">{actions}</div>}</header>;
}

export function Tabs<T extends string>({ items, value, onChange, label }: { items: Array<{ value: T; label: string; badge?: number }>; value: T; onChange: (value: T) => void; label: string }) {
  return <div className="subtabs" role="tablist" aria-label={label}>{items.map((item) => <button key={item.value} role="tab" aria-selected={item.value === value} className={item.value === value ? "active" : ""} onClick={() => onChange(item.value)} type="button"><span>{item.label}</span>{typeof item.badge === "number" && <b>{item.badge}</b>}</button>)}</div>;
}

export function GroupSelect({ groups, value, onChange, label = "Команда", allOption }: { groups: GroupSummary[]; value: string; onChange: (value: string) => void; label?: string; allOption?: { value: string; label: string } }) {
  return <label className="compact-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{allOption && <option value={allOption.value}>{allOption.label}</option>}{groups.map((group) => <option value={group.id} key={group.id}>{groupLabel(group)}</option>)}</select></label>;
}

export function SearchField({ value, onChange, placeholder, label = "Пошук" }: { value: string; onChange: (value: string) => void; placeholder: string; label?: string }) {
  const id = useId();
  return <label className="search-field" htmlFor={id}><span className="sr-only">{label}</span><Search size={18} aria-hidden="true" /><input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete="off" /></label>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty-state"><span aria-hidden="true">✦</span><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}

export function LoadingState({ label = "Завантаження…" }: { label?: string }) {
  return <div className="inline-loading" role="status"><LoaderCircle className="spin" size={20} /><span>{label}</span></div>;
}

export function StatusMessage({ kind, children }: { kind: "success" | "error" | "warning"; children: ReactNode }) {
  return <div className={`status-message ${kind}`} role={kind === "error" ? "alert" : "status"}>{kind === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}<span>{children}</span></div>;
}

export function Modal({ title, children, onClose, wide = false, footer }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; footer?: ReactNode }) {
  const titleId = useId();
  useEffect(() => {
    const handle = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", handle);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handle); document.body.style.overflow = previous; };
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-card${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><header><h2 id={titleId}>{title}</h2><button className="icon-button light" type="button" onClick={onClose} aria-label="Закрити"><X size={20} /></button></header><div className="modal-body">{children}</div>{footer && <footer>{footer}</footer>}</section></div>;
}

export function Accordion({ title, children, open, onToggle, priority }: { title: string; children: ReactNode; open: boolean; onToggle: () => void; priority?: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      window.requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
    wasOpen.current = open;
  }, [open]);
  return <section ref={sectionRef} className={`accordion${open ? " open" : ""}`}><button type="button" className="accordion-trigger" aria-expanded={open} onClick={onToggle}><span>{priority && <small>{priority}</small>}<b>{title}</b></span><ChevronDown size={20} /></button>{open && <div className="accordion-panel">{children}</div>}</section>;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "danger" | "warning" | "plum" | "teal" }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
