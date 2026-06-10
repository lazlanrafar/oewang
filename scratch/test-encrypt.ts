import { encrypt } from "../packages/encryption/index";

const secret = "50efe8b91b72a077d0e7254697be4a41";
const payload = JSON.stringify({
  messages: [{ role: "user", content: "Hello" }],
});

const encrypted = encrypt(payload, secret);
console.log(JSON.stringify({ data: encrypted }));
