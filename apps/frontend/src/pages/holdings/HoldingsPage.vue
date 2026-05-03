<template>
    <f7-page class="holdings-page">
        <f7-navbar title="My Portfolio" back-link="Back">
            <f7-nav-right>
                <f7-link icon-ios="f7:plus" icon-md="material:add" popover-open=".add-holding-popover"></f7-link>
            </f7-nav-right>
        </f7-navbar>

        <!-- Summary -->
        <f7-block-title>Overview</f7-block-title>
        <f7-card>
            <f7-card-content>
                <div class="summary-value">
                    <span class="label">Total Invested</span>
                    <span class="value">${{ holdingsStore.totalCost.toFixed(2) }}</span>
                </div>
            </f7-card-content>
        </f7-card>

        <!-- Holdings List -->
        <f7-block-title>Assets</f7-block-title>
        <f7-list strong inset media-list>
            <f7-list-item 
                v-for="holding in holdingsStore.holdings" 
                :key="holding.id"
                :title="holding.ticker"
                :subtitle="holding.type"
                :after="'$' + (holding.shares * holding.avgCost).toFixed(2)"
                swipeout
            >
                <template #text>
                    {{ holding.shares }} @ ${{ holding.avgCost }}
                </template>
                <f7-swipeout-actions right>
                    <f7-swipeout-button delete confirm-text="Are you sure?" @click="deleteHolding(holding.id)">Delete</f7-swipeout-button>
                </f7-swipeout-actions>
            </f7-list-item>
            
            <f7-list-item v-if="holdingsStore.holdings.length === 0">
                <div style="text-align: center; width: 100%; padding: 20px; color: gray;">
                    No holdings yet. Tap + to add.
                </div>
            </f7-list-item>
        </f7-list>

        <!-- Add Holding Popover/Sheet -->
        <f7-popover class="add-holding-popover">
            <f7-block>
                <h3>Add New Asset</h3>
                <f7-list form>
                    <f7-list-input
                        label="Ticker"
                        type="text"
                        placeholder="AAPL"
                        :value="form.ticker"
                        @input="form.ticker = ($event.target as HTMLInputElement).value.toUpperCase()"
                    ></f7-list-input>
                    
                    <f7-list-item>
                         <f7-segmented strong tag="div">
                            <f7-button :active="form.type === 'STOCK'" @click="form.type = 'STOCK'">Stock</f7-button>
                            <f7-button :active="form.type === 'CRYPTO'" @click="form.type = 'CRYPTO'">Crypto</f7-button>
                        </f7-segmented>
                    </f7-list-item>

                    <f7-list-input
                        label="Shares"
                        type="number"
                        placeholder="0.00"
                        :value="form.shares"
                        @input="form.shares = Number(($event.target as HTMLInputElement).value)"
                    ></f7-list-input>

                    <f7-list-input
                        label="Avg Price ($)"
                        type="number"
                        placeholder="0.00"
                        :value="form.avgCost"
                        @input="form.avgCost = Number(($event.target as HTMLInputElement).value)"
                    ></f7-list-input>

                    <f7-button fill large @click="submitHolding">Add Asset</f7-button>
                </f7-list>
            </f7-block>
        </f7-popover>
    </f7-page>
</template>

<script setup lang="ts">
import { f7 } from "framework7-vue";
import { reactive } from "vue";
import { type Holding, useHoldingsStore } from "../../stores/holdings";

const holdingsStore = useHoldingsStore();

const form = reactive({
	ticker: "",
	type: "STOCK",
    source: "AUTO",
	shares: 0,
	avgCost: 0,
});

function deleteHolding(id: number) {
	holdingsStore.deleteHolding(id);
}

function submitHolding() {
	if (!form.ticker || form.shares <= 0 || form.avgCost <= 0) {
		f7.dialog.alert("Please fill all fields correctly");
		return;
	}

	holdingsStore.addHolding(form.ticker, form.shares, form.avgCost, "AUTO");

	// Reset form
	form.ticker = "";
	form.shares = 0;
	form.avgCost = 0;

	f7.popover.close(".add-holding-popover");
	f7.toast.show({ text: "Asset Added", closeTimeout: 2000 });
}
</script>

<style scoped>
.summary-value {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px;
}
.summary-value .label {
    font-size: 14px;
    color: var(--f7-text-color);
    opacity: 0.7;
}
.summary-value .value {
    font-size: 32px;
    font-weight: bold;
    color: var(--f7-theme-color);
}
</style>
