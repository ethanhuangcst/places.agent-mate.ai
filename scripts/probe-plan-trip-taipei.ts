import { runProbe } from "./probe-plan-trip";

void runProbe("taipei").catch((err) => {
  console.error(err);
  process.exit(1);
});
