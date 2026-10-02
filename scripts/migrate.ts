import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, closeDb } from "@/lib/db";

await migrate(db, { migrationsFolder: "drizzle" });
console.log("[migrate] done");
await closeDb();
