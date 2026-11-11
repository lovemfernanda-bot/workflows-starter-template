// Verificación del JWT de Cloudflare Access.
// Producción: la API exige un JWT válido (falla cerrada si Access no está configurado).
// Desarrollo local (ENVIRONMENT=development): se permite sin login.

export interface AccessEnv {
	ENVIRONMENT: string;
	ACCESS_TEAM_DOMAIN: string;
	ACCESS_AUD: string;
}

interface Jwk extends JsonWebKey {
	kid?: string;
}
let certCache: { keys: Jwk[]; at: number } | null = null;

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
	const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}
const decodeJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function getKeys(team: string, force: boolean): Promise<Jwk[]> {
	if (!force && certCache && Date.now() - certCache.at < 3600_000) return certCache.keys;
	const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
	if (!res.ok) throw new Error("No se pudieron obtener las llaves de Access");
	const data = (await res.json()) as { keys: Jwk[] };
	certCache = { keys: data.keys, at: Date.now() };
	return data.keys;
}

export type AuthResult = { ok: true; email: string } | { ok: false; status: number; message: string };

export async function authenticate(req: Request, env: AccessEnv): Promise<AuthResult> {
	if (env.ENVIRONMENT === "development") return { ok: true, email: "dev@local" };

	const team = env.ACCESS_TEAM_DOMAIN;
	if (!team || !env.ACCESS_AUD || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)) {
		return { ok: false, status: 503, message: "Acceso no configurado en el servidor." };
	}
	const token = req.headers.get("Cf-Access-Jwt-Assertion");
	if (!token) return { ok: false, status: 401, message: "Inicia sesión para continuar." };

	try {
		const [h, p, s] = token.split(".");
		if (!h || !p || !s) throw new Error("formato");
		const header = decodeJson(h) as { kid?: string; alg?: string };
		if (header.alg !== "RS256") throw new Error("alg");

		let keys = await getKeys(team, false);
		let jwk = keys.find((k) => k.kid === header.kid);
		if (!jwk) {
			keys = await getKeys(team, true);
			jwk = keys.find((k) => k.kid === header.kid);
		}
		if (!jwk) throw new Error("kid");

		const key = await crypto.subtle.importKey(
			"jwk",
			jwk,
			{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
			false,
			["verify"],
		);
		const valid = await crypto.subtle.verify(
			"RSASSA-PKCS1-v1_5",
			key,
			b64urlToBytes(s),
			new TextEncoder().encode(`${h}.${p}`),
		);
		if (!valid) throw new Error("firma");

		const payload = decodeJson(p) as { aud?: string[] | string; exp?: number; iss?: string; email?: string };
		const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
		if (!aud.includes(env.ACCESS_AUD)) throw new Error("aud");
		if (payload.iss !== `https://${team}`) throw new Error("iss");
		if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error("exp");
		return { ok: true, email: payload.email ?? "desconocido" };
	} catch {
		return { ok: false, status: 401, message: "Sesión no válida. Vuelve a iniciar sesión." };
	}
}
