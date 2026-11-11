import { authenticate } from "./access";
import "./api";
import "./tables";
import { handleApi, type Env } from "./http";

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);
		if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);

		const auth = await authenticate(req, env);
		if (!auth.ok) {
			return new Response(JSON.stringify({ error: auth.message }), {
				status: auth.status,
				headers: { "content-type": "application/json; charset=utf-8" },
			});
		}

		// Las escrituras solo se aceptan desde nuestro propio origen (defensa contra CSRF).
		if (req.method !== "GET" && req.method !== "HEAD") {
			const origin = req.headers.get("Origin");
			if (origin && origin !== url.origin) {
				return new Response(JSON.stringify({ error: "Origen no permitido." }), {
					status: 403,
					headers: { "content-type": "application/json; charset=utf-8" },
				});
			}
		}
		return handleApi(req, env, auth.email);
	},
} satisfies ExportedHandler<Env>;
