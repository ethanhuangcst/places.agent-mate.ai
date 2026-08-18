"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import { AdminApiError, adminJson, type AdminUserRow, type SessionResponse } from "./admin-api";
import { Dialog } from "./chrome";
import { useT } from "./locale";

const schema = z.object({
  email: z.string().trim().min(1),
});

type Values = z.infer<typeof schema>;

export function UsersScreen() {
  const tt = useT();
  const queryClient = useQueryClient();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteErrorKey, setDeleteErrorKey] = useState<string | null>(null);
  const { register, handleSubmit, reset } = useForm<Values>();

  const session = useQuery({
    queryKey: ["admin-session"],
    queryFn: () => adminJson<SessionResponse>("/api/admin/session"),
  });

  const query = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminJson<{ users: AdminUserRow[] }>("/api/admin/users"),
  });

  const users = query.data?.users ?? [];
  const currentUserId = session.data?.id;
  const loadError =
    query.error instanceof AdminApiError
      ? query.error.key
      : query.isError
        ? "admin.users.error"
        : null;

  async function onInvite(values: Values) {
    const parsed = schema.safeParse(values);
    if (!parsed.success) return;
    setErrorKey(null);
    setSent(false);
    try {
      await adminJson("/api/admin/users/invite", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setSent(true);
      reset({ email: "" });
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      setErrorKey(err instanceof AdminApiError ? err.key : "errors.invite_failed");
    }
  }

  async function onConfirmDelete() {
    if (!deleteTarget || deletePending) return;
    setDeleteErrorKey(null);
    setErrorKey(null);
    setDeletePending(true);
    try {
      await adminJson(`/api/admin/users/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      setDeleteErrorKey(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      const key =
        err instanceof AdminApiError ? err.key : "errors.delete_admin_failed";
      setDeleteErrorKey(key);
      setErrorKey(key);
    } finally {
      setDeletePending(false);
    }
  }

  function openDeleteDialog(user: AdminUserRow) {
    setDeleteErrorKey(null);
    setDeleteTarget(user);
  }

  function closeDeleteDialog() {
    if (deletePending) return;
    setDeleteTarget(null);
    setDeleteErrorKey(null);
  }

  function canDeleteUser(user: AdminUserRow): boolean {
    if (!currentUserId) return false;
    if (user.id === currentUserId) return false;
    if (users.length <= 1) return false;
    return true;
  }

  return (
    <main id="content" className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow" data-i18n="admin.users.eyebrow">
            {tt("admin.users.eyebrow")}
          </p>
          <h1 data-i18n="admin.users.title">{tt("admin.users.title")}</h1>
          <p data-i18n="admin.users.lead">{tt("admin.users.lead")}</p>
        </div>
      </div>
      <h2 className="guide-sub" data-i18n="admin.users.invite">
        {tt("admin.users.invite")}
      </h2>
      {sent ? (
        <p className="auth-status" data-i18n="admin.users.invite_sent">
          {tt("admin.users.invite_sent")}
        </p>
      ) : null}
      {errorKey ? (
        <p className="error" data-i18n={errorKey}>
          {tt(errorKey)}
        </p>
      ) : null}
      <form
        className="form"
        style={{ maxWidth: "26rem", marginBottom: "2.5rem" }}
        onSubmit={handleSubmit((v) => void onInvite(v))}
      >
        <label>
          <span data-i18n="admin.users.email">{tt("admin.users.email")}</span>
          <input type="email" autoComplete="off" required {...register("email")} />
        </label>
        <div className="form-actions">
          <button className="btn" type="submit" data-i18n="admin.users.invite_submit">
            {tt("admin.users.invite_submit")}
          </button>
        </div>
      </form>
      {query.isLoading ? (
        <p data-i18n="admin.users.loading">{tt("admin.users.loading")}</p>
      ) : null}
      {loadError ? (
        <div>
          <p className="error" data-i18n={loadError}>
            {tt(loadError)}
          </p>
          <button type="button" className="btn-text" onClick={() => void query.refetch()}>
            {tt("admin.common.retry")}
          </button>
        </div>
      ) : null}
      {!query.isLoading && !loadError ? (
        <div className="table-wrap">
          <table data-testid="users-table">
            <thead>
              <tr>
                <th data-i18n="admin.users.col_name">{tt("admin.users.col_name")}</th>
                <th data-i18n="admin.users.col_email">{tt("admin.users.col_email")}</th>
                <th data-i18n="admin.users.col_status">{tt("admin.users.col_status")}</th>
                <th data-i18n="admin.users.col_actions">{tt("admin.users.col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const active = user.status === "ACTIVE";
                const deletable = canDeleteUser(user);
                return (
                  <tr key={user.id}>
                    <td>
                      {user.name ? (
                        user.name
                      ) : (
                        <span className="muted" data-i18n="admin.users.name_pending">
                          {tt("admin.users.name_pending")}
                        </span>
                      )}
                    </td>
                    <td className="mono">{user.email}</td>
                    <td>
                      <span
                        className={active ? "status is-on" : "status"}
                        data-i18n={
                          active ? "admin.users.status_active" : "admin.users.status_pending"
                        }
                      >
                        {tt(active ? "admin.users.status_active" : "admin.users.status_pending")}
                      </span>
                    </td>
                    <td>
                      {deletable ? (
                        <button
                          type="button"
                          className="btn-text"
                          data-i18n="admin.users.delete"
                          data-testid={`delete-admin-${user.id}`}
                          onClick={() => openDeleteDialog(user)}
                        >
                          {tt("admin.users.delete")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog
        open={deleteTarget !== null}
        onClose={closeDeleteDialog}
        title={tt("admin.users.delete_title")}
        body={
          deleteTarget
            ? tt("admin.users.delete_body", { email: deleteTarget.email })
            : ""
        }
        error={
          deleteErrorKey ? (
            <p className="error" data-i18n={deleteErrorKey} data-testid="delete-admin-error">
              {tt(deleteErrorKey)}
            </p>
          ) : null
        }
      >
        <button
          type="button"
          className="btn"
          data-i18n={
            deletePending ? "admin.users.delete_submitting" : "admin.users.delete_submit"
          }
          data-testid="delete-admin-confirm"
          disabled={deletePending}
          aria-busy={deletePending}
          onClick={() => void onConfirmDelete()}
        >
          {deletePending
            ? tt("admin.users.delete_submitting")
            : tt("admin.users.delete_submit")}
        </button>
        <button
          type="button"
          className="btn-text"
          data-i18n="admin.common.cancel"
          disabled={deletePending}
          onClick={closeDeleteDialog}
        >
          {tt("admin.common.cancel")}
        </button>
      </Dialog>
    </main>
  );
}
