import type { AccessEnv } from "./access";

export interface Env extends AccessEnv {
	DB: D1Database;
	ASSETS: Fetcher;
}

export class HttpError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export interface Ctx {
	env: Env;
	req: Request;
	params: Record<string, string>;
	user: string;
	query: URLSearchParams;
}
export type Handler = (c: Ctx) => Promise<Response>;

export const json = (data: unknown, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
	});

export async function readBody(req: Request): Promise<Record<string, unknown>> {
	try {
		const b = await req.json();
		if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
	} catch {
		/* cae al error */
	}
	throw new HttpError(400, "Solicitud no válida.");
}

export function str(v: unknown, field: string, max: number, required = false): string | undefined {
	if (v === undefined) {
		if (required) throw new HttpError(400, `Falta el campo "${field}".`);
		return undefined;
	}
	if (typeof v !== "string") throw new HttpError(400, `El campo "${field}" debe ser texto.`);
	const t = v.trim();
	if (required && !t) throw new HttpError(400, `El campo "${field}" no puede estar vacío.`);
	if (t.length > max) throw new HttpError(400, `El campo "${field}" es demasiado largo (máximo ${max}).`);
	return t;
}
// Para textos largos conservamos los saltos de línea y espacios internos.
export function longText(v: unknown, field: string, max: number): string | undefined {
	if (v === undefined) return undefined;
	if (typeof v !== "string") throw new HttpError(400, `El campo "${field}" debe ser texto.`);
	if (v.length > max) throw new HttpError(400, `El campo "${field}" es demasiado largo (máximo ${max}).`);
	return v;
}

export const eventStmt = (env: Env, type: string, entityId: string, payload: unknown) =>
	env.DB.prepare("INSERT INTO events (type, entity_id, payload) VALUES (?1, ?2, ?3)").bind(
		type,
		entityId,
		JSON.stringify(payload),
	);

const routes: { method: string; re: RegExp; names: string[]; handler: Handler }[] = [];
export function route(method: string, pattern: string, handler: Handler) {
	const names: string[] = [];
	const re = new RegExp(
		"^" + pattern.replace(/:([a-z_]+)/g, (_, n: string) => (names.push(n), "([^/]+)")) + "/?$",
	);
	routes.push({ method, re, names, handler });
}

export async function handleApi(req: Request, env: Env, user: string): Promise<Response> {
	const url = new URL(req.url);
	let pathMatched = false;
	try {
		for (const r of routes) {
			const m = r.re.exec(url.pathname);
			if (!m) continue;
			pathMatched = true;
			if (r.method !== req.method) continue;
			const params: Record<string, string> = {};
			r.names.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
			return await r.handler({ env, req, params, user, query: url.searchParams });
		}
		return json({ error: pathMatched ? "Método no permitido." : "No encontrado." }, pathMatched ? 405 : 404);
	} catch (e) {
		if (e instanceof HttpError) return json({ error: e.message }, e.status);
		console.error(e);
		return json({ error: "Error interno. Inténtalo de nuevo." }, 500);
	}
}
