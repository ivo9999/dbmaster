"use client";

import { useEffect, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { autocompletion } from "@codemirror/autocomplete";
import { bracketMatching } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { sqlEditorTheme, sqlEditorHighlighting } from "./sql-editor-theme";
import { createSqlCompletions } from "./sql-completions";

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute?: () => void;
  connectionId: string;
  database?: string;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: string;
}

export function SqlEditor({
  value,
  onChange,
  onExecute,
  connectionId,
  database,
  readOnly = false,
  minHeight = "200px",
}: SqlEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onExecuteRef = useRef(onExecute);

  // Keep refs up to date
  useEffect(() => {
    onChangeRef.current = onChange;
    onExecuteRef.current = onExecute;
  }, [onChange, onExecute]);

  useEffect(() => {
    if (!editorRef.current) return;

    // Create custom keymap for Cmd+Enter
    const customKeymap = keymap.of([
      {
        key: "Mod-Enter", // Cmd+Enter on Mac, Ctrl+Enter on Windows
        run: () => {
          onExecuteRef.current?.();
          return true;
        },
      },
    ]);

    // Create autocomplete provider
    const completionProvider = autocompletion({
      override: [createSqlCompletions(connectionId, database)],
    });

    // Initialize editor state
    const state = EditorState.create({
      doc: value,
      extensions: [
        sql({ dialect: PostgreSQL }),
        bracketMatching(),
        history(),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        customKeymap,
        completionProvider,
        sqlEditorTheme,
        sqlEditorHighlighting,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorState.readOnly.of(readOnly),
      ],
    });

    // Create editor view
    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    // Cleanup
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, database, readOnly]); // Only recreate when these change

  // Update value when prop changes (from history/favorites)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  return (
    <div
      ref={editorRef}
      className="overflow-hidden rounded-md border border-input"
      style={{ minHeight }}
    />
  );
}
