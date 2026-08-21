"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AdminApiError, adminJson, type ApiKeyRow } from "./admin-api";
import { Dialog } from "./chrome";
import { formatIssuedDate } from "./format";
import { selectAllIds, selectionState, toggleId } from "./key-selection";
import { useLocale, useT } from "./locale";

export function KeysScreen() {
  const tt = useT();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteErrorKey, setDeleteErrorKey] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ["admin-api-keys"],
    queryFn: () => adminJson<{ keys: ApiKeyRow[] }>("/api/admin/api-keys"),
  });

  const keys = query.data?.keys ?? [];
  const keyIds = keys.map((row) => row.id);
  const selectedOnPage = selected.filter((id) => keyIds.includes(id));
  const selectState = selectionState(keyIds, selectedOnPage);
  const empty = query.isSuccess && keys.length === 0;
  const errorKey =
    query.error instanceof AdminApiError ? query.error.key : query.isError ? "admin.keys.error" : null;

  useEffect(() => {
    const box = selectAllRef.current;
    if (box) box.indeterminate = selectState === "some";
  }, [selectState]);

  async function onConfirmDelete() {
    if (selectedOnPage.length === 0 || deletePending) return;
    setDeletePending(true);
    setDeleteErrorKey(null);
    try {
      await adminJson("/api/admin/api-keys", {
        method: "DELETE",
        body: JSON.stringify({ ids: selectedOnPage }),
      });
      setConfirmOpen(false);
      setSelected([]);
      await queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });
    } catch (err) {
      setDeleteErrorKey(err instanceof AdminApiError ? err.key : "admin.keys.error");
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <main id="content" className="content content--keys">
      <div className="page-head">
        <p className="eyebrow" data-i18n="admin.keys.eyebrow">
          {tt("admin.keys.eyebrow")}
        </p>
        <div className="page-head-row">
          <p className="page-head-lead" data-i18n="admin.keys.lead">
            {tt("admin.keys.lead")}
          </p>
          <div className="page-head-actions">
            <Link
              className="btn btn-page"
              href="/admin/api-keys/new"
              data-i18n="admin.keys.issue"
              data-testid="issue-key"
            >
              {tt("admin.keys.issue")}
            </Link>
            <button
              type="button"
              className="btn btn-page"
              data-i18n="admin.keys.bulk_delete"
              data-testid="keys-delete-selected"
              disabled={empty || selectedOnPage.length === 0 || deletePending}
              onClick={() => {
                if (selectedOnPage.length === 0 || deletePending) return;
                setDeleteErrorKey(null);
                setConfirmOpen(true);
              }}
            >
              {tt("admin.keys.bulk_delete")}
            </button>
          </div>
        </div>
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
              <th className="table-check">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  data-testid="keys-select-all"
                  aria-label={tt("admin.keys.select_all")}
                  checked={selectState === "all"}
                  onChange={(e) => setSelected(selectAllIds(keyIds, e.target.checked))}
                />
              </th>
              <th data-i18n="admin.keys.col_name">{tt("admin.keys.col_name")}</th>
              <th data-i18n="admin.keys.col_prefix">{tt("admin.keys.col_prefix")}</th>
              <th data-i18n="admin.keys.col_status">{tt("admin.keys.col_status")}</th>
              <th data-i18n="admin.keys.col_issued">{tt("admin.keys.col_issued")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((row) => {
              const checked = selectedOnPage.includes(row.id);
              return (
                <tr key={row.id}>
                  <td className="table-check">
                    <input
                      type="checkbox"
                      data-testid={`keys-select-${row.name}`}
                      aria-label={tt("admin.keys.select_row", { name: row.name })}
                      checked={checked}
                      onChange={(e) => setSelected(toggleId(selected, row.id, e.target.checked))}
                    />
                  </td>
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
                      <KeyCopyButton name={row.name} secret={row.secret} />
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
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="empty" data-testid="keys-empty" hidden={!empty}>
        <p data-i18n="admin.keys.empty">{tt("admin.keys.empty")}</p>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => {
          if (deletePending) return;
          setConfirmOpen(false);
          setDeleteErrorKey(null);
        }}
        title={tt("admin.keys.delete_selected_title")}
        body={tt("admin.keys.delete_selected_body", { count: String(selectedOnPage.length) })}
        error={
          deleteErrorKey ? (
            <p className="error" data-i18n={deleteErrorKey} data-testid="keys-delete-selected-error">
              {tt(deleteErrorKey)}
            </p>
          ) : null
        }
      >
        <button
          type="button"
          className="btn"
          data-i18n="admin.keys.delete_selected_submit"
          data-testid="keys-delete-selected-confirm"
          disabled={deletePending}
          aria-busy={deletePending}
          onClick={() => void onConfirmDelete()}
        >
          {tt("admin.keys.delete_selected_submit")}
        </button>
        <button
          type="button"
          className="btn-text"
          data-i18n="admin.common.cancel"
          disabled={deletePending}
          onClick={() => {
            if (deletePending) return;
            setConfirmOpen(false);
            setDeleteErrorKey(null);
          }}
        >
          {tt("admin.common.cancel")}
        </button>
      </Dialog>
    </main>
  );
}

function KeyCopyButton({ name, secret }: { name: string; secret: string | null }) {
  const tt = useT();
  const [copied, setCopied] = useState(false);
  const available = Boolean(secret);

  async function onCopy() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
    } catch {
      /* clipboard may be unavailable; still acknowledge */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      data-i18n={copied ? "admin.common.copied" : "admin.keys.copy_list"}
      data-testid={`keys-copy-${name}`}
      disabled={!available}
      title={available ? undefined : tt("admin.keys.copy_unavailable")}
      aria-label={
        !available
          ? tt("admin.keys.copy_unavailable")
          : copied
            ? tt("admin.keys.copied_to_clipboard")
            : tt("admin.keys.copy_list")
      }
      onClick={() => void onCopy()}
    >
      {copied ? tt("admin.common.copied") : tt("admin.keys.copy_list")}
    </button>
  );
}
