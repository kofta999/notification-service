import { serve } from "@hono/node-server";
import app from "./app";
import "./jobs/reaper";
import "./jobs/reconciliator";
import { config } from "./config";

serve(app);
console.log("Server up and listening on port 3000");

for (let i = 0; i < config.NUM_THREADS; ++i) {
  new Worker("./src/worker/dispatcher.ts");
  console.log(`Worker ${i} is running`);
}
