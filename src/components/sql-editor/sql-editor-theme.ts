import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// Custom theme matching app's dark mode
export const sqlEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--background)",
      color: "var(--foreground)",
      fontSize: "0.875rem",
      fontFamily: "var(--font-geist-mono)",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "var(--primary)",
      padding: "1rem",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--primary)",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "oklch(0.556 0 0 / 0.2)",
    },
    "&.cm-focused .cm-selectionBackground": {
      backgroundColor: "oklch(0.556 0 0 / 0.3)",
    },
    ".cm-activeLine": {
      backgroundColor: "oklch(0.269 0 0 / 0.5)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--muted)",
      color: "var(--muted-foreground)",
      border: "none",
      borderRight: "1px solid var(--border)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "oklch(0.269 0 0 / 0.7)",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-geist-mono)",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--popover)",
      border: "1px solid var(--border)",
      borderRadius: "0.5rem",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul": {
        fontFamily: "var(--font-geist-mono)",
        fontSize: "0.875rem",
      },
      "& > ul > li[aria-selected]": {
        backgroundColor: "var(--accent)",
        color: "var(--accent-foreground)",
      },
    },
  },
  { dark: true }
);

// Syntax highlighting colors
const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#c792ea" }, // Purple for keywords
  { tag: tags.operator, color: "#89ddff" }, // Cyan for operators
  { tag: tags.string, color: "#c3e88d" }, // Green for strings
  { tag: tags.number, color: "#f78c6c" }, // Orange for numbers
  { tag: tags.bool, color: "#f78c6c" }, // Orange for booleans
  { tag: tags.null, color: "#f78c6c" }, // Orange for NULL
  { tag: tags.comment, color: "#546e7a" }, // Gray for comments
  { tag: tags.variableName, color: "#eeffff" }, // White for identifiers
  { tag: tags.typeName, color: "#ffcb6b" }, // Yellow for types
  { tag: tags.function(tags.variableName), color: "#82aaff" }, // Blue for functions
]);

export const sqlEditorHighlighting = syntaxHighlighting(highlightStyle);
