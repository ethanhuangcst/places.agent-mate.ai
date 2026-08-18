"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCallback, useEffect, useState } from "react";
import {
  AdminApiError,
  adminJson,
  type ApiKeyDetail,
  type ApiKeySecretPayload,
} from "./admin-api";
import { Dialog, SecretOncePanel } from "./chrome";
import { useT } from "./locale";

const schema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function EditKeyScreen({ id }: { id: string }) {
  const tt = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [dialog, setDialog] = useState<"regenerate" | "delete" | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; secret: string } | null>(null);
  const { register, handleSubmit, reset } = useForm<Values>();

  const query = useQuery({
    queryKey: ["admin-api-key", id],
    queryFn: () => adminJson<ApiKeyDetail>(`/api/admin/api-keys/${id}`),
  });

  useEffect(() => {
    if (query.data) {
      reset({ name: query.data.name, description: query.data.description });
    }
  }, [query.data, reset]);

  useEffect(() => {
    const confirm = searchParams.get("confirm");
    if (confirm === "regenerate" || confirm === "delete") setDialog(confirm);
  }, [searchParams]);

  const closeDialog = useCallback(() => setDialog(null), []);

  async function onSave(values: Values) {
    const parsed = schema.safeParse(values);
    if (!parsed.success) return;
    setErrorKey(null);
    try {
      await adminJson(`/api/admin/api-keys/${id}`, {
        method: "PATCH",
        body: JSON.stringify(parsed.data),
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });
      router.push("/admin/api-keys");
      router.refresh();
    } catch (err) {
      setErrorKey(err instanceof AdminApiError ? err.key : "admin.keys.error");
    }
  }

  async function onRegenerate() {
    setErrorKey(null);
    try {
      const result = await adminJson<ApiKeySecretPayload>(
        `/api/admin/api-keys/${id}/regenerate`,
        { method: "POST" },
      );
      setDialog(null);
      setCreated({
        name: query.data?.name ?? result.name ?? "",
        secret: result.secret,
      });
    } catch (err) {
      setErrorKey(err instanceof AdminApiError ? err.key : "admin.keys.error");
    }
  }

  async function onDelete() {
    setErrorKey(null);
    try {
      await adminJson(`/api/admin/api-keys/${id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });
      router.push("/admin/api-keys");
      router.refresh();
    } catch (err) {
      setErrorKey(err instanceof AdminApiError ? err.key : "admin.keys.error");
    }
  }

  if (created) {
    return (
      <main id="content" className="content">
        <div className="page-head">
          <div>
            <p className="eyebrow" data-i18n="admin.keys.eyebrow">
              {tt("admin.keys.eyebrow")}
            </p>
            <h1 data-i18n="admin.keys.created_title">{tt("admin.keys.created_title")}</h1>
            <p data-i18n="admin.keys.created_lead">{tt("admin.keys.created_lead")}</p>
          </div>
        </div>
        <SecretOncePanel
          name={created.name}
          secret={created.secret}
          onDone={() => {
            setCreated(null);
            void queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });
            router.push("/admin/api-keys");
          }}
        />
      </main>
    );
  }

  const loadError =
    query.error instanceof AdminApiError ? query.error.key : query.isError ? "admin.keys.error" : null;

  return (
    <main id="content" className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow" data-i18n="admin.keys.eyebrow">
            {tt("admin.keys.eyebrow")}
          </p>
          <h1 data-i18n="admin.keys.edit_title">{tt("admin.keys.edit_title")}</h1>
          {query.data ? (
            <p className="mono" style={{ marginTop: "0.35rem" }}>
              {query.data.prefix}
            </p>
          ) : null}
        </div>
      </div>
      {query.isLoading ? (
        <p data-i18n="admin.keys.loading">{tt("admin.keys.loading")}</p>
      ) : null}
      {loadError ? (
        <p className="error" data-i18n={loadError}>
          {tt(loadError)}
        </p>
      ) : null}
      {errorKey ? (
        <p className="error" data-i18n={errorKey}>
          {tt(errorKey)}
        </p>
      ) : null}
      {query.data ? (
        <>
          <form
            className="form"
            style={{ maxWidth: "26rem" }}
            onSubmit={handleSubmit((v) => void onSave(v))}
          >
            <label>
              <span data-i18n="admin.keys.name">{tt("admin.keys.name")}</span>
              <input type="text" required {...register("name")} />
            </label>
            <label>
              <span data-i18n="admin.keys.description">{tt("admin.keys.description")}</span>
              <input type="text" {...register("description")} />
            </label>
            <div className="form-actions">
              <button className="btn" type="submit" data-i18n="admin.common.save">
                {tt("admin.common.save")}
              </button>
              <Link className="btn-text" href="/admin/api-keys" data-i18n="admin.keys.back_list">
                {tt("admin.keys.back_list")}
              </Link>
            </div>
          </form>
          <div className="form-actions" style={{ maxWidth: "26rem" }}>
            <button
              type="button"
              className="btn-text"
              data-i18n="admin.keys.regenerate"
              onClick={() => setDialog("regenerate")}
            >
              {tt("admin.keys.regenerate")}
            </button>
            <button
              type="button"
              className="btn-text"
              data-i18n="admin.keys.delete"
              onClick={() => setDialog("delete")}
            >
              {tt("admin.keys.delete")}
            </button>
          </div>
        </>
      ) : null}

      <Dialog
        open={dialog === "regenerate"}
        onClose={closeDialog}
        title={tt("admin.keys.regenerate_title")}
        body={tt("admin.keys.regenerate_body")}
      >
        <button
          type="button"
          className="btn"
          data-i18n="admin.keys.regenerate_submit"
          onClick={() => void onRegenerate()}
        >
          {tt("admin.keys.regenerate_submit")}
        </button>
        <button
          type="button"
          className="btn-text"
          data-i18n="admin.common.cancel"
          onClick={closeDialog}
        >
          {tt("admin.common.cancel")}
        </button>
      </Dialog>
      <Dialog
        open={dialog === "delete"}
        onClose={closeDialog}
        title={tt("admin.keys.delete_title")}
        body={tt("admin.keys.delete_body")}
      >
        <button
          type="button"
          className="btn"
          data-i18n="admin.keys.delete_submit"
          onClick={() => void onDelete()}
        >
          {tt("admin.keys.delete_submit")}
        </button>
        <button
          type="button"
          className="btn-text"
          data-i18n="admin.common.cancel"
          onClick={closeDialog}
        >
          {tt("admin.common.cancel")}
        </button>
      </Dialog>
    </main>
  );
}
