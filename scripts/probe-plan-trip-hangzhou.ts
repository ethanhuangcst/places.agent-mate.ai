import { runProbe } from "./probe-plan-trip";

void runProbe("hangzhou").catch((err) => {
  console.error(err);
  process.exit(1);
});
