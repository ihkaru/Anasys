<template>
    <f7-block class="category-chips-block">
        <div class="category-chips">
            <f7-chip v-for="cat in categories" :key="cat.slug" :text="cat.name" :outline="!selected.includes(cat.slug)"
                :color="selected.includes(cat.slug) ? 'primary' : undefined" @click="toggle(cat.slug)"></f7-chip>
        </div>
    </f7-block>
</template>

<script setup lang="ts">
const props = defineProps<{
	selected: string[];
}>();

const emit = defineEmits<(e: "update:selected", value: string[]) => void>();

const categories = [
	{ name: "Stocks", slug: "STOCK" },
	{ name: "Crypto", slug: "CRYPTO" },
];

function toggle(slug: string) {
	const newSelected = [...props.selected];
	const idx = newSelected.indexOf(slug);
	if (idx >= 0) {
		newSelected.splice(idx, 1);
	} else {
		newSelected.push(slug);
	}
	emit("update:selected", newSelected);
}
</script>

<style scoped>
.category-chips-block {
    padding-top: 8px;
    padding-bottom: 0;
}

.category-chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
</style>
