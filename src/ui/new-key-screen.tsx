"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import { AdminApiError, adminJson, type ApiKeySecretPayload } from "./admin-api";
import { SecretOncePanel } from "./chrome";
import { useT } from "./locale";

const schema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function NewKeyScreen() {
  const tt = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; secret: string } | null>(null);
  const { register, handleSubmit } = useForm<Values>();

  async function onSubmit(values: Values) {
    const parsed = schema.safeParse(values);
    if (!parsed.success) return;
    setErrorKey(null);
    try {
      const result = await adminJson<ApiKeySecretPayload>("/api/admin/api-keys", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setCreated({ name: result.name ?? parsed.data.name, secret: result.secret });
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

  return (
    <main id="content" className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow" data-i18n="admin.keys.eyebrow">
            {tt("admin.keys.eyebrow")}
          </p>
          <h1 data-i18n="admin.keys.issue">{tt("admin.keys.issue")}</h1>
          <p data-i18n="admin.keys.lead">{tt("admin.keys.lead")}</p>
        </div>
      </div>
      {errorKey ? (
        <p className="error" data-i18n={errorKey}>
          {tt(errorKey)}
        </p>
      ) : null}
      <form
        className="form"
        style={{ maxWidth: "26rem" }}
        onSubmit={handleSubmit((v) => void onSubmit(v))}
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
          <button className="btn" type="submit" data-i18n="admin.keys.create_submit">
            {tt("admin.keys.create_submit")}
          </button>
          <Link className="btn-text" href="/admin/api-keys" data-i18n="admin.common.cancel">
            {tt("admin.common.cancel")}
          </Link>
        </div>
      </form>
    </main>
  );
}
