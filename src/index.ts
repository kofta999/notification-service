import { serve } from "@hono/node-server";
import app from "./app";

serve(app);
console.log("Server up and listening on port 3000");

new Worker("./src/dispatcher.ts");
console.log("Worker running");
