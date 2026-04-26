const ws = new WebSocket("ws://localhost:28081/ws/market");

ws.onopen = () => {
	console.log("Connected to WS!");
	ws.send(
		JSON.stringify({
			type: "subscribe",
			channel: "quote",
			symbols: ["COMEX:GC1!"],
			source: "COMEX",
		}),
	);
	ws.send(
		JSON.stringify({
			type: "subscribe",
			channel: "quote",
			symbols: ["BINANCE:BTCUSDT"],
			source: "BINANCE",
		}),
	);
};

ws.onmessage = (event) => {
	console.log("Message received:", event.data);
};

ws.onclose = () => console.log("Disconnected");

setTimeout(() => {
	console.log("Test finished.");
	ws.close();
	process.exit(0);
}, 10000); // Wait 10 seconds
