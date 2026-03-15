import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { db } from "./apps/backend/src/db";
import { users } from "@packages/db/src/schema";
import { getJwtSecret } from "./apps/backend/src/config";
import axios from "axios";

async function run() {
    console.log("Fetching a user from DB...");
    const userList = await db.select().from(users).limit(1);
    if (!userList.length) {
        console.error("No users found in DB to test with.");
        process.exit(1);
    }
    const user = userList[0];
    console.log(`Using user: ${user.email} (ID: ${user.id})`);

    // We can't easily use Elysia's JWT plugin outside a request context without app instantiation
    // But we know it's just standard JWT signing. Let's start an ephemeral app to sign it.
    
    let token = "";
    
    const app = new Elysia()
        .use(jwt({ name: "jwt", secret: getJwtSecret() }))
        .get("/sign", async ({ jwt }) => {
             return await jwt.sign({
                id: user.id,
                email: user.email,
            });
        });
        
    app.listen(3001);
    console.log("Mock signer listening on 3001");
    
    const res = await fetch("http://localhost:3001/sign");
    token = await res.text();
    console.log("Got token:", token.substring(0, 20) + "...");
    
    app.stop();
    
    console.log("Fetching API with token...");
    try {
        const testRes = await axios.get('http://localhost:3000/api/market/history/AAPL?interval=1d&limit=100', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        
        console.log("Status:", testRes.status);
        console.log("Response data count:", testRes.data?.data?.length);
        if (testRes.data?.data?.length > 0) {
            console.log("Sample:", testRes.data.data[0]);
        } else {
            console.log("Empty data array returned from API.");
        }
    } catch(e) {
        console.error("API error:", e.response?.status, e.response?.data || e.message);
    }
    
    process.exit(0);
}

run();
