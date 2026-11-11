// Reglas del flujo compartidas por la API (Worker) y la interfaz.

export const NETWORKS = ["instagram", "facebook", "tiktok", "linkedin"] as const;
export type Network = (typeof NETWORKS)[number];

export const NETWORK_LABEL: Record<Network, string> = {
	instagram: "Instagram",
	facebook: "Facebook",
	tiktok: "TikTok",
	linkedin: "LinkedIn",
};

export const STATUSES = [
	"idea",
	"borrador",
	"en_revision",
	"cambios_solicitados",
	"aprobada",
	"programada",
	"publicada",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
	idea: "Idea",
	borrador: "Borrador",
	en_revision: "En revisión",
	cambios_solicitados: "Cambios solicitados",
	aprobada: "Aprobada",
	programada: "Programada",
	publicada: "Publicada",
};

export const TRANSITIONS: Record<Status, readonly Status[]> = {
	idea: ["borrador"],
	borrador: ["idea", "en_revision"],
	en_revision: ["aprobada", "cambios_solicitados", "borrador"],
	cambios_solicitados: ["borrador", "en_revision"],
	aprobada: ["programada", "borrador"],
	programada: ["publicada", "aprobada"],
	publicada: [],
};

export const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function isNetwork(v: unknown): v is Network {
	return typeof v === "string" && (NETWORKS as readonly string[]).includes(v);
}
export function isStatus(v: unknown): v is Status {
	return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

/** Devuelve un mensaje de error en español, o null si el cambio es válido. */
export function validateTransition(
	from: Status,
	to: Status,
	ctx: { publishAt: string | null; note: string; copy: string },
): string | null {
	if (!TRANSITIONS[from].includes(to)) {
		return `No se puede pasar de "${STATUS_LABEL[from]}" a "${STATUS_LABEL[to]}".`;
	}
	if (to === "cambios_solicitados" && !ctx.note.trim()) {
		return "Escribe una nota explicando qué cambios necesitas.";
	}
	if (to === "en_revision" && !ctx.copy.trim()) {
		return "Escribe el texto antes de enviarlo a revisión.";
	}
	if (to === "programada" && !ctx.publishAt) {
		return "Asigna una fecha y hora antes de marcarla como programada.";
	}
	return null;
}

/** Estado general de una idea a partir de sus versiones por red. */
export function derivePostStatus(statuses: readonly Status[]): Status | null {
	if (statuses.length === 0) return null;
	if (statuses.includes("cambios_solicitados")) return "cambios_solicitados";
	if (statuses.includes("en_revision")) return "en_revision";
	return statuses.reduce((a, b) => (STATUSES.indexOf(a) <= STATUSES.indexOf(b) ? a : b));
}
