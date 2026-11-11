// Tablas personalizadas (estilo Monday/Notion): tipos de columna y validación de celdas.
// Compartido por la API (que valida) y la interfaz (que muestra los tipos).

export const COL_TYPES = ["text", "number", "select", "multiselect", "date", "checkbox", "url"] as const;
export type ColType = (typeof COL_TYPES)[number];

export const COL_TYPE_LABEL: Record<ColType, string> = {
	text: "Texto",
	number: "Número",
	select: "Selección",
	multiselect: "Selección múltiple",
	date: "Fecha",
	checkbox: "Casilla",
	url: "Enlace",
};

export const OPTION_COLORS = [
	{ value: "#E4DED2", name: "Piedra" },
	{ value: "#FFF0B1", name: "Amarillo" },
	{ value: "#FDE0E0", name: "Rosa" },
	{ value: "#DCEBDD", name: "Verde" },
	{ value: "#DDE6F3", name: "Azul" },
	{ value: "#EADCF3", name: "Lila" },
	{ value: "#FBE3CF", name: "Naranja" },
] as const;

export interface Option {
	id: string;
	label: string;
	color: string;
}

export const LIMITS = { columns: 30, rows: 1000, tables: 100, options: 30, text: 2000, url: 500, rowBytes: 30000 };

const OPTION_ID_RE = /^[a-z0-9_]{1,24}$/i;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Valida y normaliza las opciones de una columna de selección. */
export function sanitizeOptions(raw: unknown): Result<Option[]> {
	if (raw === undefined || raw === null) return { ok: true, value: [] };
	if (!Array.isArray(raw)) return { ok: false, error: "Las opciones no son válidas." };
	if (raw.length > LIMITS.options) return { ok: false, error: `Máximo ${LIMITS.options} opciones.` };
	const seen = new Set<string>();
	const out: Option[] = [];
	for (const o of raw) {
		if (!o || typeof o !== "object") return { ok: false, error: "Las opciones no son válidas." };
		const { id, label, color } = o as Record<string, unknown>;
		const l = typeof label === "string" ? label.trim() : "";
		if (!l) return { ok: false, error: "Cada opción necesita un nombre." };
		if (l.length > 40) return { ok: false, error: "El nombre de una opción es demasiado largo (máximo 40)." };
		if (typeof id !== "string" || !OPTION_ID_RE.test(id)) return { ok: false, error: "Opción con identificador no válido." };
		if (seen.has(id)) return { ok: false, error: "Opciones repetidas." };
		seen.add(id);
		out.push({ id, label: l, color: typeof color === "string" && HEX_RE.test(color) ? color : OPTION_COLORS[0].value });
	}
	return { ok: true, value: out };
}

export interface ColumnShape {
	name: string;
	type: ColType;
	options: Option[];
}

/** Valida y normaliza el valor de una celda. `null` significa "vacía". */
export function validateCell(col: ColumnShape, value: unknown): Result<unknown> {
	const bad = (msg = `Valor no válido para "${col.name}".`): Result<unknown> => ({ ok: false, error: msg });
	if (value === undefined) return bad();

	if (col.type === "checkbox") {
		if (value === null || value === false) return { ok: true, value: null };
		return value === true ? { ok: true, value: true } : bad();
	}
	if (value === null || value === "") return { ok: true, value: null };

	switch (col.type) {
		case "text": {
			if (typeof value !== "string") return bad();
			if (value.length > LIMITS.text) return bad(`"${col.name}" admite hasta ${LIMITS.text} caracteres.`);
			return { ok: true, value: value.trim() === "" ? null : value };
		}
		case "number":
			return typeof value === "number" && Number.isFinite(value) ? { ok: true, value } : bad();
		case "select":
			return typeof value === "string" && col.options.some((o) => o.id === value) ? { ok: true, value } : bad();
		case "multiselect": {
			if (!Array.isArray(value)) return bad();
			const ids = [...new Set(value)];
			if (!ids.every((v) => typeof v === "string" && col.options.some((o) => o.id === v))) return bad();
			return { ok: true, value: ids.length ? ids : null };
		}
		case "date": {
			if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return bad();
			const d = new Date(`${value}T00:00:00Z`);
			return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? { ok: true, value } : bad();
		}
		case "url": {
			if (typeof value !== "string" || value.length > LIMITS.url) return bad();
			return /^https?:\/\/\S+$/i.test(value) ? { ok: true, value } : bad(`"${col.name}" debe ser un enlace que empiece con http:// o https://`);
		}
	}
}
