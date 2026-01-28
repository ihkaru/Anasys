
import { computed, type Ref } from 'vue';
import { type Signal } from '../../../stores/market';

export function useSignalMarkers(signals: Ref<Signal[]>) {
  const buySignals = computed(() => 
    signals.value.filter(s => s.type === 'BUY').length
  );
  
  const sellSignals = computed(() => 
    signals.value.filter(s => s.type === 'SELL').length
  );
  
  const totalSignals = computed(() => signals.value.length);
  
  const hasSignals = computed(() => totalSignals.value > 0);
  
  return {
    buySignals,
    sellSignals,
    totalSignals,
    hasSignals,
  };
}
