// A small, safe Markdown-to-HTML for the AI's replies: headings, lists, code,
// bold, italic and [[links]] (which open notes). Everything is escaped first.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string): string {
	return esc(s)
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
		.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
		.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) => `<a class="link" data-note="${target}">${label ?? target}</a>`)
		.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1");
}

export function markdown(text: string): string {
	const out: string[] = [];
	const lines = text.replace(/\r/g, "").split("\n");
	let list: "ul" | "ol" | null = null;
	const close = () => {
		if (list) out.push(`</${list}>`);
		list = null;
	};
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^```/.test(line)) {
			close();
			const code: string[] = [];
			while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
			out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
			continue;
		}
		const h = /^(#{1,4})\s+(.*)$/.exec(line);
		const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
		const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
		if (h) {
			close();
			out.push(`<h${Math.min(4, h[1].length + 2)}>${inline(h[2])}</h${Math.min(4, h[1].length + 2)}>`);
		} else if (ul || ol) {
			const kind = ul ? "ul" : "ol";
			if (list !== kind) {
				close();
				out.push(`<${kind}>`);
				list = kind;
			}
			out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
		} else if (!line.trim()) {
			close();
		} else {
			close();
			// Lines of one paragraph stay together.
			const para = [line];
			while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#{1,4}\s|\s*[-*+]\s|\s*\d+[.)]\s|```)/.test(lines[i + 1])) para.push(lines[++i]);
			out.push(`<p>${para.map(inline).join("<br>")}</p>`);
		}
	}
	close();
	return out.join("");
}
