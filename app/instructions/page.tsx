import { GuideBody } from "@/src/ui/guide-body";
import { GuideShell } from "@/src/ui/shells";

export default function InstructionsPage() {
  return (
    <GuideShell>
      <main id="content" className="guide-body">
        <GuideBody />
      </main>
    </GuideShell>
  );
}
