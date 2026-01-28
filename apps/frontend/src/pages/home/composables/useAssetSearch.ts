import { computed, ref, type Ref } from 'vue';

export interface Asset {
  ticker: string;
  name?: string;
  type?: string;
  [key: string]: any;
}

export function useAssetSearch(allAssets: Ref<Asset[]>) {
  const searchQuery = ref('');
  
  const filteredAssets = computed(() => {
    const q = searchQuery.value.toLowerCase().trim();
    if (!q) return allAssets.value.slice(0, 10);
    
    return allAssets.value.filter(a =>
      a.ticker.toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q)
    );
  });
  
  function onSearch(_: any, query: string) {
    searchQuery.value = query;
  }
  
  function reset() {
    searchQuery.value = '';
  }
  
  return { searchQuery, filteredAssets, onSearch, reset };
}
