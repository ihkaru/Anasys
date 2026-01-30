<template>
    <div class="chart-legend">
        <span class="legend-item buy">
            <span class="dot"></span> Buy Signal
        </span>
        <span class="legend-item sell">
            <span class="dot"></span> Sell Signal
        </span>
    </div>
</template>

<style scoped>
.chart-legend {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--muted-text, #6b7280);
    z-index: 5;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
}

.legend-item .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

.legend-item.buy .dot {
    background: var(--positive-color, #10b981);
}

.legend-item.sell .dot {
    background: var(--negative-color, #ef4444);
}
</style>
