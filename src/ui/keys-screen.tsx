"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AdminApiError, adminJson, type ApiKeyRow } from "./admin-api";
import { formatIssuedDate } from "./format";
import { useLocale, useT } from "./locale";

export function KeysScreen() {
  const tt = useT();
  const locale = useLocale();
  const query = useQuery({
    queryKey: ["admin-api-keys"],
    queryFn: () => adminJson<{ keys: ApiKeyRow[] }>("/api/admin/api-keys"),
  });

  const keys = query.data?.keys ?? [];
  const empty = query.isSuccess && keys.length === 0;
  const errorKey =
    query.error instanceof AdminApiError ? query.error.key : query.isError ? "admin.keys.error" : null;

  return (
    <main id="content" className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow" data-i18n="admin.keys.eyebrow">
            {tt("admin.keys.eyebrow")}
          </p>
          <h1 data-i18n="admin.keys.title">{tt("admin.keys.title")}</h1>
          <p data-i18n="admin.keys.lead">{tt("admin.keys.lead")}</p>
        </div>
        <Link
          className="btn btn-page"
          href="/admin/api-keys/new"
          data-i18n="admin.keys.issue"
          data-testid="issue-key"
        >
          {tt("admin.keys.issue")}
        </Link>
      </div>
      {query.isLoading ? (
        <p data-i18n="admin.keys.loading">{tt("admin.keys.loading")}</p>
      ) : null}
      {errorKey ? (
        <div>
          <p className="error" data-i18n={errorKey}>
            {tt(errorKey)}
          </p>
          <button type="button" className="btn-text" onClick={() => void query.refetch()}>
            {tt("admin.common.retry")}
          </button>
        </div>
      ) : null}
      <div
        className="table-wrap"
        data-testid="keys-table"
        hidden={empty || query.isLoading || !!errorKey}
      >
        <table>
          <thead>
            <tr>
              <th data-i18n="admin.keys.col_name">{tt("admin.keys.col_name")}</th>
              <th data-i18n="admin.keys.col_prefix">{tt("admin.keys.col_prefix")}</th>
              <th data-i18n="admin.keys.col_status">{tt("admin.keys.col_status")}</th>
              <th data-i18n="admin.keys.col_issued">{tt("admin.keys.col_issued")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td className="mono">{row.prefix}</td>
                <td>
                  <span className="status is-on" data-i18n="admin.keys.status_active">
                    {tt("admin.keys.status_active")}
                  </span>
                </td>
                <td>{formatIssuedDate(locale, row.issued)}</td>
                <td>
                  <div className="row-actions">
                    <Link href={`/admin/api-keys/${row.id}`} data-i18n="admin.keys.edit">
                      {tt("admin.keys.edit")}
                    </Link>
                    <Link
                      href={`/admin/api-keys/${row.id}?confirm=regenerate`}
                      data-i18n="admin.keys.regenerate"
                    >
                      {tt("admin.keys.regenerate")}
                    </Link>
                    <Link
                      href={`/admin/api-keys/${row.id}?confirm=delete`}
                      data-i18n="admin.keys.delete"
                    >
                      {tt("admin.keys.delete")}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="empty" data-testid="keys-empty" hidden={!empty}>
        <p data-i18n="admin.keys.empty">{tt("admin.keys.empty")}</p>
        <Link className="btn" href="/admin/api-keys/new" data-i18n="admin.keys.issue">
          {tt("admin.keys.issue")}
        </Link>
      </div>
    </main>
  );
}
