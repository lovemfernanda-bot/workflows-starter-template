import type { Brand } from "../api";
import { STATUSES, STATUS_LABEL } from "../../shared/rules";
import { ItemCard, type Item } from "../ui";

export default function Board({
	items,
	brands,
	onOpen,
}: {
	items: Item[];
	brands: Map<string, Brand>;
	onOpen: (postId: string) => void;
}) {
	return (
		<section aria-label="Contenido por estado" className="board">
			{STATUSES.map((s) => {
				const col = items
					.filter((i) => i.v.status === s)
					.sort((a, b) => (a.v.publish_at ?? "9999") < (b.v.publish_at ?? "9999") ? -1 : 1);
				return (
					<div key={s} className="col">
						<h3 className="col-title">
							<span className={`chip chip-${s}`}>{STATUS_LABEL[s]}</span>
							<span className="col-count">{col.length}</span>
						</h3>
						{col.length === 0 && <p className="col-empty">Nada aquí</p>}
						{col.map((it) => (
							<ItemCard
								key={it.v.id}
								item={it}
								brand={brands.get(it.post.brand_id)}
								showStatus={false}
								onOpen={() => onOpen(it.post.id)}
							/>
						))}
					</div>
				);
			})}
		</section>
	);
}
