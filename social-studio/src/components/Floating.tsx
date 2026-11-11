import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
	anchor: HTMLElement; // el botón que abrió el menú
	onClose: () => void;
	className?: string;
	role?: string;
	label?: string;
	children: React.ReactNode;
}

/**
 * Menú flotante que se dibuja encima de todo (no se recorta dentro de cajas con scroll),
 * se coloca junto al botón que lo abrió y se mueve arriba si abajo no cabe.
 */
export default function Floating({ anchor, onClose, className, role, label, children }: Props) {
	const ref = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const r = anchor.getBoundingClientRect();
		const margin = 8;
		let top = r.bottom + 4;
		if (top + el.offsetHeight > window.innerHeight - margin) top = Math.max(margin, r.top - el.offsetHeight - 4);
		const left = Math.max(margin, Math.min(r.left, window.innerWidth - el.offsetWidth - margin));
		setPos({ top, left });
	}, [anchor]);

	useEffect(() => {
		const away = (e: MouseEvent) => {
			const t = e.target as Node;
			if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
		};
		const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		const scroll = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
		document.addEventListener("mousedown", away);
		document.addEventListener("keydown", esc);
		window.addEventListener("scroll", scroll, true);
		window.addEventListener("resize", onClose);
		return () => {
			document.removeEventListener("mousedown", away);
			document.removeEventListener("keydown", esc);
			window.removeEventListener("scroll", scroll, true);
			window.removeEventListener("resize", onClose);
		};
	}, [anchor, onClose]);

	return createPortal(
		<div
			ref={ref}
			className={`floating ${className ?? ""}`}
			role={role}
			aria-label={label}
			style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
		>
			{children}
		</div>,
		document.body,
	);
}
