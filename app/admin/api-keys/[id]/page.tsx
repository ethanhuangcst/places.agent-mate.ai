import { Suspense } from "react";
import { EditKeyScreen } from "@/src/ui/edit-key-screen";

export default async function EditApiKeyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <EditKeyScreen id={id} />
    </Suspense>
  );
}
