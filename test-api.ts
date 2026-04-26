import axios from "axios";

async function runTest() {
	try {
		const api = axios.create({ baseURL: "http://localhost:3000/api", withCredentials: true });
		console.log("Logging in...");
		const loginRes = await api.post("/auth/google", { token: "test-dummy-token-for-dev" });
		console.log("Login res status:", loginRes.status);

		console.log("Fetching history...");
		const historyRes = await api.get("/market/history/AAPL?interval=1d&limit=100");
		console.log("History response data count:", historyRes.data.data?.length);
		console.log("Sample:", historyRes.data.data?.[0]);
	} catch (err) {
		if (err.response) {
			console.error("API Error:", err.response.status, err.response.data);
		} else {
			console.error("Error:", err.message);
		}
	}
}

runTest();
