<template>
    <f7-sheet class="add-holding-sheet" :opened="opened" @sheet:closed="$emit('close')" swipe-to-close backdrop>
        <f7-toolbar>
            <div class="left">
                <f7-link sheet-close>Cancel</f7-link>
            </div>
            <div class="right">
                <f7-link @click="handleSave">Save</f7-link>
            </div>
        </f7-toolbar>

        <f7-page-content>
            <f7-block-title large>{{ editing ? 'Edit' : 'Add' }} Holding</f7-block-title>

            <f7-list no-hairlines-md>
                <f7-list-input label="Source" type="select" :value="form.source"
                    @change="form.source = ($event.target as HTMLSelectElement).value" :disabled="!!editing">
                    <option value="YAHOO">Yahoo Finance</option>
                    <option value="TRADINGVIEW">TradingView</option>
                </f7-list-input>

                <f7-list-input label="Ticker" type="text" placeholder="e.g. AAPL" :value="form.ticker"
                    @input="form.ticker = ($event.target as HTMLInputElement).value.toUpperCase()"
                    :disabled="!!editing"></f7-list-input>

                <f7-list-input label="Quantity (Shares/Coins)" type="number" placeholder="Number of shares or coins"
                    :value="form.shares" @input="form.shares = parseFloat(($event.target as HTMLInputElement).value)"
                    clear-button></f7-list-input>

                <f7-list-input label="Average Buy Price" type="number" placeholder="Avg price per share/coin"
                    :value="form.avgCost" @input="form.avgCost = parseFloat(($event.target as HTMLInputElement).value)"
                    clear-button></f7-list-input>
            </f7-list>
        </f7-page-content>
    </f7-sheet>
</template>

<script setup lang="ts">
import { f7 } from "framework7-vue";
import { reactive, watch } from "vue";

export interface HoldingFormData {
	ticker: string;
	shares: number;
	avgCost: number;
	source: string;
}

const props = defineProps<{
	opened: boolean;
	editing?: any | null;
}>();

const emit = defineEmits<{
	(e: "close"): void;
	(e: "save", data: HoldingFormData): void;
}>();

const form = reactive<HoldingFormData>({
	ticker: "",
	shares: 0,
	avgCost: 0,
	source: "YAHOO",
});

// Watch for editing prop changes
watch(
	() => props.editing,
	(holding) => {
		if (holding) {
			form.ticker = holding.ticker;
			form.shares = holding.shares;
			form.avgCost = holding.avgCost;
			form.source = holding.source || "YAHOO";
		} else {
			resetForm();
		}
	},
);

function resetForm() {
	form.ticker = "";
	form.shares = 0; // Ensure number
	form.avgCost = 0; // Ensure number
	form.source = "YAHOO";
}

function handleSave() {
	if (!form.ticker || form.shares <= 0 || form.avgCost <= 0) {
		f7.toast.show({ text: "Please fill all fields", closeTimeout: 2000 });
		return;
	}

	emit("save", { ...form });
	resetForm();
}
</script>

<style scoped>
.add-holding-sheet {
    height: auto;
    max-height: 60%;
}
</style>
