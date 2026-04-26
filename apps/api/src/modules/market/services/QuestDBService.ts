import { Logger } from "../../../utils/logger";

const logger = new Logger("QuestDBService");

export interface QuestDBResponse {
	query: string;
	columns: { name: string; type: string }[];
	dataset: any[][];
	count: number;
}

export class QuestDBService {
	private baseUrl: string;

	constructor() {
		this.baseUrl = process.env.QUESTDB_URL || "http://questdb:9000";
	}

	async query(sql: string): Promise<QuestDBResponse> {
		try {
			const url = `${this.baseUrl}/exec?query=${encodeURIComponent(sql)}`;
			const response = await fetch(url);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`QuestDB error (${response.status}): ${errorText}`);
			}

			return (await response.json()) as QuestDBResponse;
		} catch (error) {
			logger.error(`Query failed: ${sql}`, error);
			throw error;
		}
	}

	/**
	 * Formats raw QuestDB dataset into array of objects using column names
	 */
	formatResult<T>(response: QuestDBResponse): T[] {
		const { columns, dataset } = response;
		return dataset.map((row) => {
			const obj: any = {};
			columns.forEach((col, index) => {
				obj[col.name] = row[index];
			});
			return obj as T;
		});
	}
}

export const questDbService = new QuestDBService();
