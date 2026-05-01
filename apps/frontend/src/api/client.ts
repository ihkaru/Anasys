import axios from "axios";

import { createLogger } from "../utils/logger";

const logger = createLogger("API");

export const api = axios.create({
	baseURL: import.meta.env.VITE_API_URL || "/api",
	withCredentials: true, // Important for cookies
});

api.interceptors.request.use((req) => {
	logger.debug(`REQ: ${req.method?.toUpperCase()} ${req.url}`);
	return req;
});

api.interceptors.response.use(
	(res) => {
		logger.debug(`RES: ${res.status} ${res.config.url}`);
		return res;
	},
	(error) => {
		logger.error(`ERR: ${error.response?.status} ${error.config?.url}`, error.message);
		return Promise.reject(error);
	},
);
