// The editor on screen, for commands that act on the open note (like writing help).
import type { EditorView } from "@codemirror/view";

export const activeEditor: { view: EditorView | null } = { view: null };
