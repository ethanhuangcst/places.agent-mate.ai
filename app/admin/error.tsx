"use client";

import { useT } from "@/src/ui/locale";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const tt = useT();
  return (
    <div className="content">
      <h1 data-i18n="errors.unexpected">{tt("errors.unexpected")}</h1>
      <p className="error" data-testid="admin-error-message">
        {error.message || tt("errors.unexpected")}
      </p>
      <button
        className="btn"
        type="button"
        onClick={reset}
        data-i18n="admin.common.retry"
        data-testid="admin-error-retry"
      >
        {tt("admin.common.retry")}
      </button>
    </div>
  );
}
