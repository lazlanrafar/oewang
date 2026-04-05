import fs from "fs";
import * as jose from "jose";

import { db } from "../../../../packages/database/client";
import { users } from "../../../../packages/database/schema/users";
import { workspaces } from "../../../../packages/database/schema/workspaces";

async function run() {
  const { sql } = require("drizzle-orm");
  const allUsersRes = await db.execute(
    sql`SELECT id, email FROM users LIMIT 1`,
  );
  const alLWorkspacesRes = await db.execute(
    sql`SELECT id FROM workspaces LIMIT 1`,
  );

  if (!allUsersRes.length || !alLWorkspacesRes.length) {
    console.error("No valid user/workspace");
    process.exit(1);
  }

  const userId = allUsersRes[0].id;
  const workspaceId = alLWorkspacesRes[0].id;
  const userEmail = allUsersRes[0].email;

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error(
      "JWT_SECRET is missing from environment. Remember to run with --env-file=../../.env",
    );
    process.exit(1);
  }

  const filePath = require("path").join(__dirname, "IMG_2590.jpeg");
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log("Reading image and converting to base64...");
  const fileBuffer = fs.readFileSync(filePath);
  const base64Image = fileBuffer.toString("base64");
  const mimeType = "image/jpeg";

  console.log("Generating JWT...");
  const JWT_SECRET_KEY = new TextEncoder().encode(jwtSecret);
  const token = await new jose.SignJWT({
    user_id: userId as string,
    workspace_id: workspaceId as string,
    email: userEmail as string,
    system_role: "user",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(JWT_SECRET_KEY);

  console.log("Calling localhost API...");
  try {
    const res = await fetch("http://127.0.0.1:3002/v1/ai/parse-receipt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-workspace-id": workspaceId as string,
      },
      body: JSON.stringify({
        file: {
          name: "IMG_2590.jpeg",
          data: base64Image,
          type: mimeType,
        },
      }),
    });

    const data = await res.json();
    let plainResponse = data;

    if (data.data) {
      try {
        const secret = process.env.ENCRYPTION_KEY;
        if (secret) {
          const [ivHex, encryptedHex, authTagHex] = data.data.split(":");
          const iv = Buffer.from(ivHex, "hex");
          const encryptedText = Buffer.from(encryptedHex, "hex");
          const authTag = Buffer.from(authTagHex, "hex");
          const keyBuffer = Buffer.from(secret, "utf-8").slice(0, 32);

          const decipher = require("crypto").createDecipheriv(
            "aes-256-gcm",
            keyBuffer,
            iv,
          );
          decipher.setAuthTag(authTag);

          let decrypted = decipher.update(encryptedText);
          decrypted = Buffer.concat([decrypted, decipher.final()]);
          plainResponse = JSON.parse(decrypted.toString("utf-8"));
        }
      } catch (e) {
        // ignore fallback
      }
    }

    console.log("-----------------------------------------");
    console.log(`✅ PARSE RESULT (Status: ${res.status}):`);
    console.log(JSON.stringify(plainResponse, null, 2));
    console.log("-----------------------------------------");
  } catch (err: any) {
    console.error("❌ ERROR PARSING RECEIPT:", err.message);
  }

  process.exit(0);
}

run();
