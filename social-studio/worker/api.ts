import {
	NETWORKS,
	DATETIME_RE,
	derivePostStatus,
	isNetwork,
	isStatus,
	validateTransition,
	type Network,
	type Status,
} from "../shared/rules";
import type { AccessEnv } from "./access";

export interface Env extends AccessEnv {
	DB: D1Database;
	ASSETS: Fetcher;
}

class HttpError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

interface BrandRow {
	id: string;
	name: string;
	color: string;
	networks: string;
	external_ref: string | null;
	archived: number;
	created_at: string;
}
interface PostRow {
	id: string;
	brand_id: string;
	title: string;
	idea: string;
	pillar: string;
	external_ref: string | null;
	created_at: string;
	updated_at: string;
}
interface VersionRow {
	id: string;
	post_id: string;
	network: Network;
	copy: string;
	hashtags: string;
	publish_at: string | null;
	status: Status;
	review_note: string | null;
	published_url: string | null;
	created_at: string;
	updated_at: string;
}
interface HistoryRow {
	id: number;
	version_id: string;
	from_status: Status | null;
	to_status: Status;
	note: string | null;
	actor: string | null;
	at: string;
}

interface Ctx {
	env: Env;
	req: Request;
	params: Record<string, string>;
	user: string;
	query: URLSearchParams;
}
type Handler = (c: Ctx) => Promise<Response>;

const json = (data: unknown, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
	});

async function readBody(req: Request): Promise<Record<string, unknown>> {
	try {
		const b = await req.json();
		if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
	} catch {
		/* cae al error */
	}
	throw new HttpError(400, "Solicitud no válida.");
}

function str(v: unknown, field: string, max: number, required = false): string | undefined {
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
function longText(v: unknown, field: string, max: number): string | undefined {
	if (v === undefined) return undefined;
	if (typeof v !== "string") throw new HttpError(400, `El campo "${field}" debe ser texto.`);
	if (v.length > max) throw new HttpError(400, `El campo "${field}" es demasiado largo (máximo ${max}).`);
	return v;
}
function dateTime(v: unknown): string | null | undefined {
	if (v === undefined) return undefined;
	if (v === null || v === "") return null;
	if (typeof v !== "string" || !DATETIME_RE.test(v)) throw new HttpError(400, "Fecha y hora no válidas.");
	return v;
}
function colorOf(v: unknown): string | undefined {
	const c = str(v, "color", 7);
	if (c !== undefined && !/^#[0-9a-fA-F]{6}$/.test(c)) throw new HttpError(400, "Color no válido.");
	return c;
}
function networksOf(v: unknown, required: boolean): Network[] | undefined {
	if (v === undefined) {
		if (required) throw new HttpError(400, 'Falta el campo "networks".');
		return undefined;
	}
	if (!Array.isArray(v) || v.length === 0 || !v.every(isNetwork)) {
		throw new HttpError(400, "Elige al menos una red válida.");
	}
	return NETWORKS.filter((n) => (v as string[]).includes(n));
}
function urlOf(v: unknown): string | undefined {
	const u = str(v, "published_url", 500);
	if (u && !/^https?:\/\/\S+$/i.test(u)) throw new HttpError(400, "El enlace debe empezar con http:// o https://");
	return u;
}

const brandOut = (b: BrandRow) => ({
	id: b.id,
	name: b.name,
	color: b.color,
	networks: JSON.parse(b.networks) as Network[],
	external_ref: b.external_ref,
});

const eventStmt = (env: Env, type: string, entityId: string, payload: unknown) =>
	env.DB.prepare("INSERT INTO events (type, entity_id, payload) VALUES (?1, ?2, ?3)").bind(
		type,
		entityId,
		JSON.stringify(payload),
	);

async function loadPosts(env: Env, opts: { brandId?: string; postId?: string }) {
	const arg = opts.postId ?? opts.brandId;
	const where = opts.postId ? "WHERE p.id = ?1" : opts.brandId ? "WHERE p.brand_id = ?1" : "";
	const prep = (sql: string) => (arg !== undefined ? env.DB.prepare(sql).bind(arg) : env.DB.prepare(sql));

	const [posts, versions] = await Promise.all([
		prep(`SELECT p.* FROM posts p ${where} ORDER BY p.updated_at DESC LIMIT 500`).all<PostRow>(),
		prep(`SELECT v.* FROM post_versions v JOIN posts p ON p.id = v.post_id ${where}`).all<VersionRow>(),
	]);

	let history: HistoryRow[] = [];
	if (opts.postId) {
		history = (
			await env.DB.prepare(
				`SELECT h.* FROM status_history h
				 WHERE h.version_id IN (SELECT id FROM post_versions WHERE post_id = ?1)
				 ORDER BY h.id DESC`,
			)
				.bind(opts.postId)
				.all<HistoryRow>()
		).results;
	}

	const byPost = new Map<string, (VersionRow & { history?: HistoryRow[] })[]>();
	for (const v of versions.results) {
		const list = byPost.get(v.post_id) ?? [];
		list.push(opts.postId ? { ...v, history: history.filter((h) => h.version_id === v.id) } : v);
		byPost.set(v.post_id, list);
	}
	return posts.results.map((p) => {
		const vs = (byPost.get(p.id) ?? []).sort((a, b) => NETWORKS.indexOf(a.network) - NETWORKS.indexOf(b.network));
		return { ...p, status: derivePostStatus(vs.map((v) => v.status)), versions: vs };
	});
}

async function requireBrand(env: Env, id: string): Promise<BrandRow> {
	const b = await env.DB.prepare("SELECT * FROM brands WHERE id = ?1 AND archived = 0").bind(id).first<BrandRow>();
	if (!b) throw new HttpError(404, "La marca no existe.");
	return b;
}

const routes: { method: string; re: RegExp; names: string[]; handler: Handler }[] = [];
function route(method: string, pattern: string, handler: Handler) {
	const names: string[] = [];
	const re = new RegExp(
		"^" + pattern.replace(/:([a-z_]+)/g, (_, n: string) => (names.push(n), "([^/]+)")) + "/?$",
	);
	routes.push({ method, re, names, handler });
}

// ---------- Sesión ----------
route("GET", "/api/v1/me", async (c) => json({ email: c.user }));

// ---------- Marcas ----------
route("GET", "/api/v1/brands", async ({ env }) => {
	const rows = await env.DB.prepare("SELECT * FROM brands WHERE archived = 0 ORDER BY name").all<BrandRow>();
	return json(rows.results.map(brandOut));
});

route("POST", "/api/v1/brands", async ({ env, req, user }) => {
	const b = await readBody(req);
	const name = str(b.name, "name", 80, true)!;
	const color = colorOf(b.color) ?? "#C62828";
	const networks = networksOf(b.networks, false) ?? [...NETWORKS];
	const id = `brand_${crypto.randomUUID()}`;
	await env.DB.batch([
		env.DB.prepare("INSERT INTO brands (id, name, color, networks) VALUES (?1, ?2, ?3, ?4)").bind(
			id,
			name,
			color,
			JSON.stringify(networks),
		),
		eventStmt(env, "brand.created", id, { name, by: user }),
	]);
	return json(brandOut((await requireBrand(env, id))), 201);
});

route("PATCH", "/api/v1/brands/:id", async ({ env, req, params }) => {
	await requireBrand(env, params.id);
	const b = await readBody(req);
	const name = str(b.name, "name", 80);
	if (name === "") throw new HttpError(400, "El nombre no puede estar vacío.");
	const color = colorOf(b.color);
	const networks = networksOf(b.networks, false);
	await env.DB.prepare(
		"UPDATE brands SET name = COALESCE(?2, name), color = COALESCE(?3, color), networks = COALESCE(?4, networks) WHERE id = ?1",
	)
		.bind(params.id, name ?? null, color ?? null, networks ? JSON.stringify(networks) : null)
		.run();
	return json(brandOut(await requireBrand(env, params.id)));
});

// ---------- Publicaciones ----------
route("GET", "/api/v1/posts", async ({ env, query }) => {
	const brandId = query.get("brand_id") ?? undefined;
	return json(await loadPosts(env, { brandId }));
});

route("GET", "/api/v1/posts/:id", async ({ env, params }) => {
	const [post] = await loadPosts(env, { postId: params.id });
	if (!post) throw new HttpError(404, "La publicación no existe.");
	return json(post);
});

route("POST", "/api/v1/posts", async ({ env, req, user }) => {
	const b = await readBody(req);
	const brand = await requireBrand(env, str(b.brand_id, "brand_id", 100, true)!);
	const title = str(b.title, "title", 200, true)!;
	const idea = longText(b.idea, "idea", 5000) ?? "";
	const pillar = str(b.pillar, "pillar", 80) ?? "";
	const networks = networksOf(b.networks, true)!;
	const publishAt = dateTime(b.publish_at) ?? null;

	const id = `post_${crypto.randomUUID()}`;
	const stmts = [
		env.DB.prepare("INSERT INTO posts (id, brand_id, title, idea, pillar) VALUES (?1, ?2, ?3, ?4, ?5)").bind(
			id,
			brand.id,
			title,
			idea,
			pillar,
		),
	];
	for (const n of networks) {
		const vid = `ver_${crypto.randomUUID()}`;
		stmts.push(
			env.DB.prepare("INSERT INTO post_versions (id, post_id, network, publish_at) VALUES (?1, ?2, ?3, ?4)").bind(
				vid,
				id,
				n,
				publishAt,
			),
			env.DB.prepare(
				"INSERT INTO status_history (version_id, from_status, to_status, actor) VALUES (?1, NULL, 'idea', ?2)",
			).bind(vid, user),
		);
	}
	stmts.push(eventStmt(env, "post.created", id, { brand_id: brand.id, title, networks, by: user }));
	await env.DB.batch(stmts);
	const [post] = await loadPosts(env, { postId: id });
	return json(post, 201);
});

route("PATCH", "/api/v1/posts/:id", async ({ env, req, params }) => {
	const b = await readBody(req);
	const title = str(b.title, "title", 200);
	if (title === "") throw new HttpError(400, "El título no puede estar vacío.");
	const idea = longText(b.idea, "idea", 5000);
	const pillar = str(b.pillar, "pillar", 80);
	const res = await env.DB.prepare(
		`UPDATE posts SET title = COALESCE(?2, title), idea = COALESCE(?3, idea),
		 pillar = COALESCE(?4, pillar), updated_at = datetime('now') WHERE id = ?1`,
	)
		.bind(params.id, title ?? null, idea ?? null, pillar ?? null)
		.run();
	if (!res.meta.changes) throw new HttpError(404, "La publicación no existe.");
	const [post] = await loadPosts(env, { postId: params.id });
	return json(post);
});

route("DELETE", "/api/v1/posts/:id", async ({ env, params, user }) => {
	const post = await env.DB.prepare("SELECT id, title FROM posts WHERE id = ?1").bind(params.id).first<PostRow>();
	if (!post) throw new HttpError(404, "La publicación no existe.");
	await env.DB.batch([
		env.DB.prepare(
			"DELETE FROM status_history WHERE version_id IN (SELECT id FROM post_versions WHERE post_id = ?1)",
		).bind(params.id),
		env.DB.prepare("DELETE FROM post_versions WHERE post_id = ?1").bind(params.id),
		env.DB.prepare("DELETE FROM posts WHERE id = ?1").bind(params.id),
		eventStmt(env, "post.deleted", params.id, { title: post.title, by: user }),
	]);
	return json({ ok: true });
});

route("POST", "/api/v1/posts/:id/networks", async ({ env, req, params, user }) => {
	const b = await readBody(req);
	if (!isNetwork(b.network)) throw new HttpError(400, "Red no válida.");
	const exists = await env.DB.prepare("SELECT id FROM posts WHERE id = ?1").bind(params.id).first();
	if (!exists) throw new HttpError(404, "La publicación no existe.");
	const dup = await env.DB.prepare("SELECT id FROM post_versions WHERE post_id = ?1 AND network = ?2")
		.bind(params.id, b.network)
		.first();
	if (dup) throw new HttpError(409, "Esa red ya está en la publicación.");
	const vid = `ver_${crypto.randomUUID()}`;
	await env.DB.batch([
		env.DB.prepare("INSERT INTO post_versions (id, post_id, network) VALUES (?1, ?2, ?3)").bind(vid, params.id, b.network),
		env.DB.prepare(
			"INSERT INTO status_history (version_id, from_status, to_status, actor) VALUES (?1, NULL, 'idea', ?2)",
		).bind(vid, user),
		env.DB.prepare("UPDATE posts SET updated_at = datetime('now') WHERE id = ?1").bind(params.id),
	]);
	const [post] = await loadPosts(env, { postId: params.id });
	return json(post, 201);
});

// ---------- Versiones por red ----------
route("PATCH", "/api/v1/versions/:id", async ({ env, req, params, user }) => {
	const v = await env.DB.prepare("SELECT * FROM post_versions WHERE id = ?1").bind(params.id).first<VersionRow>();
	if (!v) throw new HttpError(404, "La versión no existe.");
	const b = await readBody(req);
	const copy = longText(b.copy, "copy", 5000);
	const hashtags = str(b.hashtags, "hashtags", 500);
	const publishAt = dateTime(b.publish_at);
	const publishedUrl = urlOf(b.published_url);

	if (v.status === "programada" && publishAt === null) {
		throw new HttpError(409, "Una publicación programada necesita fecha. Vuelve a 'Aprobada' para quitarla.");
	}
	const textChanged =
		(copy !== undefined && copy !== v.copy) || (hashtags !== undefined && hashtags !== v.hashtags);
	// La aprobación vale para el texto revisado: si cambia, vuelve a borrador.
	const reopen = textChanged && v.status === "aprobada";

	const stmts = [
		env.DB.prepare(
			`UPDATE post_versions SET copy = COALESCE(?2, copy), hashtags = COALESCE(?3, hashtags),
			 publish_at = CASE WHEN ?4 = 1 THEN ?5 ELSE publish_at END,
			 published_url = COALESCE(?6, published_url),
			 status = CASE WHEN ?7 = 1 THEN 'borrador' ELSE status END,
			 updated_at = datetime('now') WHERE id = ?1`,
		).bind(
			params.id,
			copy ?? null,
			hashtags ?? null,
			publishAt !== undefined ? 1 : 0,
			publishAt ?? null,
			publishedUrl ?? null,
			reopen ? 1 : 0,
		),
		env.DB.prepare("UPDATE posts SET updated_at = datetime('now') WHERE id = ?1").bind(v.post_id),
	];
	if (reopen) {
		stmts.push(
			env.DB.prepare(
				"INSERT INTO status_history (version_id, from_status, to_status, note, actor) VALUES (?1, 'aprobada', 'borrador', ?2, ?3)",
			).bind(params.id, "El texto cambió después de la aprobación.", user),
		);
	}
	await env.DB.batch(stmts);
	const row = await env.DB.prepare("SELECT * FROM post_versions WHERE id = ?1").bind(params.id).first<VersionRow>();
	return json(row);
});

route("POST", "/api/v1/versions/:id/transition", async ({ env, req, params, user }) => {
	const v = await env.DB.prepare("SELECT * FROM post_versions WHERE id = ?1").bind(params.id).first<VersionRow>();
	if (!v) throw new HttpError(404, "La versión no existe.");
	const b = await readBody(req);
	if (!isStatus(b.to)) throw new HttpError(400, "Estado no válido.");
	const to = b.to;
	const note = str(b.note, "note", 1000) ?? "";
	const url = urlOf(b.published_url) ?? "";

	const error = validateTransition(v.status, to, { publishAt: v.publish_at, note, copy: v.copy });
	if (error) throw new HttpError(409, error);

	// Chequeo optimista: solo avanza si nadie cambió el estado mientras tanto.
	const res = await env.DB.prepare(
		`UPDATE post_versions SET status = ?2, review_note = ?3,
		 published_url = CASE WHEN ?4 <> '' THEN ?4 ELSE published_url END,
		 updated_at = datetime('now') WHERE id = ?1 AND status = ?5`,
	)
		.bind(params.id, to, to === "cambios_solicitados" ? note : null, url, v.status)
		.run();
	if (!res.meta.changes) throw new HttpError(409, "El estado cambió en otra pestaña. Recarga e inténtalo de nuevo.");

	await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO status_history (version_id, from_status, to_status, note, actor) VALUES (?1, ?2, ?3, ?4, ?5)",
		).bind(params.id, v.status, to, note || null, user),
		env.DB.prepare("UPDATE posts SET updated_at = datetime('now') WHERE id = ?1").bind(v.post_id),
		eventStmt(env, `version.${to}`, params.id, { post_id: v.post_id, network: v.network, from: v.status, to, by: user }),
	]);
	const row = await env.DB.prepare("SELECT * FROM post_versions WHERE id = ?1").bind(params.id).first<VersionRow>();
	return json(row);
});

// ---------- Respaldo ----------
route("GET", "/api/v1/export", async ({ env }) => {
	const all = async (t: string) => (await env.DB.prepare(`SELECT * FROM ${t}`).all()).results;
	const data = {
		exported_at: new Date().toISOString(),
		brands: await all("brands"),
		posts: await all("posts"),
		post_versions: await all("post_versions"),
		status_history: await all("status_history"),
	};
	return new Response(JSON.stringify(data, null, 2), {
		headers: {
			"content-type": "application/json; charset=utf-8",
			"content-disposition": `attachment; filename="social-studio-${new Date().toISOString().slice(0, 10)}.json"`,
			"cache-control": "no-store",
		},
	});
});

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
