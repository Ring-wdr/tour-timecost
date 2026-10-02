import "dotenv/config";
import { closeDb } from "@/lib/db";
import { computeRegions } from "@/lib/regions";

console.log(await computeRegions());
await closeDb();
