import { serve } from "@hono/node-server";
import app from "./app";
import { NUM_THREADS } from "./config";

serve(app);
console.log("Server up and listening on port 3000");

for (let i = 0; i < NUM_THREADS; ++i) {
  new Worker("./src/worker/dispatcher.ts");
  console.log(`Worker ${i} is running`);
}
