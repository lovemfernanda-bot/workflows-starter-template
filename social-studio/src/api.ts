import type { Network, Status } from "../shared/rules";

export interface Brand {
	id: string;
	name: string;
	color: string;
	networks: Network[];
}
export interface HistoryItem {
	id: number;
	from_status: Status | null;
	to_status: Status;
	note: string | null;
	actor: string | null;
	at: string;
}
export interface Version {
	id: string;
	post_id: string;
	network: Network;
	copy: string;
	hashtags: string;
	publish_at: string | null;
	status: Status;
	review_note: string | null;
	published_url: string | null;
	history?: HistoryItem[];
}
export interface Post {
	id: string;
	brand_id: string;
	title: string;
	idea: string;
	pillar: string;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
	status: Status | null;
	versions: Version[];
}
export interface Settings {
	timezone: string;
	week_start: "sunday" | "monday";
}

export class ApiError extends Error {}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`/api/v1${path}`, {
			method,
			headers: body !== undefined ? { "content-type": "application/json" } : undefined,
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
	} catch {
		throw new ApiError("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
	}
	const data = await res.json().catch(() => null);
	if (!res.ok) throw new ApiError((data as { error?: string } | null)?.error ?? "Algo salió mal. Inténtalo de nuevo.");
	return data as T;
}

export const api = {
	brands: () => call<Brand[]>("GET", "/brands"),
	createBrand: (b: { name: string; color: string; networks: Network[] }) => call<Brand>("POST", "/brands", b),
	updateBrand: (id: string, b: { name: string; color: string; networks: Network[] }) =>
		call<Brand>("PATCH", `/brands/${id}`, b),
	posts: () => call<Post[]>("GET", "/posts"),
	trashedPosts: () => call<Post[]>("GET", "/posts?deleted=1"),
	settings: () => call<Settings>("GET", "/settings"),
	saveSettings: (s: Partial<Settings>) => call<Settings>("PUT", "/settings", s),
	restorePost: (id: string) => call<Post>("POST", `/posts/${id}/restore`),
	deletePostForever: (id: string) => call<{ ok: true }>("DELETE", `/posts/${id}?permanent=1`),
	post: (id: string) => call<Post>("GET", `/posts/${id}`),
	createPost: (b: {
		brand_id: string;
		title: string;
		idea: string;
		pillar: string;
		networks: Network[];
		publish_at: string | null;
	}) => call<Post>("POST", "/posts", b),
	updatePost: (id: string, b: { title: string; idea: string; pillar: string }) => call<Post>("PATCH", `/posts/${id}`, b),
	deletePost: (id: string) => call<{ ok: true }>("DELETE", `/posts/${id}`),
	addNetwork: (id: string, network: Network) => call<Post>("POST", `/posts/${id}/networks`, { network }),
	updateVersion: (
		id: string,
		b: { copy: string; hashtags: string; publish_at: string | null; published_url?: string },
	) => call<Version>("PATCH", `/versions/${id}`, b),
	transition: (id: string, to: Status, note?: string, published_url?: string) =>
		call<Version>("POST", `/versions/${id}/transition`, { to, note, published_url }),
};
