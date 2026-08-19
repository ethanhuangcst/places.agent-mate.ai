"use client";

import { useState } from "react";
import { CopyIcon } from "./icons";
import { useT } from "./locale";

export function GuideCopyBlock({
  text,
  multiline = false,
  testId,
}: {
  text: string;
  multiline?: boolean;
  testId?: string;
}) {
  const tt = useT();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be unavailable */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className={multiline ? "code-block code-block--multiline" : "code-block"}>
      <pre>
        <code>{text}</code>
      </pre>
      <button
        type="button"
        className="btn-copy"
        data-testid={testId}
        aria-label={copied ? tt("admin.keys.copied_to_clipboard") : tt("admin.keys.copy")}
        onClick={() => void copy()}
      >
        <CopyIcon />
      </button>
      <p
        className={copied ? "copy-status is-visible" : "copy-status"}
        role="status"
        aria-live="polite"
        hidden={!copied}
      >
        {tt("admin.common.copied")}
      </p>
    </div>
  );
}
