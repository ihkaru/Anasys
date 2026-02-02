import { ref } from "vue";

export interface FilterOption {
	slug: string;
	name: string;
}

export function useExploreFilters(initialCategories: string[] = []) {
	const selectedCategories = ref<string[]>(initialCategories);
	const searchQuery = ref("");
	const filterSheetOpened = ref(false);

	const categories: FilterOption[] = [
		{ name: "Stocks", slug: "STOCK" },
		{ name: "Crypto", slug: "CRYPTO" },
	];

	function toggleCategory(slug: string) {
		const idx = selectedCategories.value.indexOf(slug);
		if (idx >= 0) {
			selectedCategories.value.splice(idx, 1);
		} else {
			selectedCategories.value.push(slug);
		}
	}

	function clearFilters() {
		selectedCategories.value = [];
	}

	function setFilters(cats: string[]) {
		selectedCategories.value = cats;
	}

	return {
		selectedCategories,
		searchQuery,
		filterSheetOpened,
		categories,
		toggleCategory,
		clearFilters,
		setFilters,
	};
}
