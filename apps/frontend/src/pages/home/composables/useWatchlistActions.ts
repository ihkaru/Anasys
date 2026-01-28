import { f7 } from 'framework7-vue';
import type { Ref } from 'vue';
import { useWatchlistStore } from '../../../stores/watchlist';

export function useWatchlistActions(
  watchlistStore: ReturnType<typeof useWatchlistStore>,
  selectedWatchlistId: Ref<number | null>,
  watchlists: Ref<any[]>
) {
  
  function showWatchlistActions() {
    f7.dialog.create({
      title: 'Watchlist Actions',
      buttons: [
        { text: 'Create New Watchlist', onClick: showCreateDialog },
        { text: 'Rename Current', onClick: showRenameDialog },
        { text: 'Delete Current', color: 'red', onClick: confirmDelete },
        { text: 'Cancel', color: 'gray' },
      ],
      verticalButtons: true,
    }).open();
  }

  async function showCreateDialog() {
    f7.dialog.prompt('Enter watchlist name:', 'New Watchlist', async (name) => {
      if (name.trim()) {
        try {
          const created = await watchlistStore.createWatchlist(name.trim());
          selectedWatchlistId.value = created.id;
          f7.toast.show({ text: `Created "${name}"`, closeTimeout: 2000 });
        } catch (e) {
          f7.toast.show({ text: 'Failed to create watchlist', closeTimeout: 2000 });
        }
      }
    });
  }

  async function showRenameDialog() {
    const current = watchlists.value.find(w => w.id === selectedWatchlistId.value);
    if (!current) return;

    f7.dialog.prompt('Enter new name:', 'Rename Watchlist', async (name) => {
      if (name.trim()) {
        try {
          await watchlistStore.updateWatchlist(current.id, { name: name.trim() });
          f7.toast.show({ text: `Renamed to "${name}"`, closeTimeout: 2000 });
        } catch (e) {
          f7.toast.show({ text: 'Failed to rename', closeTimeout: 2000 });
        }
      }
    }, undefined, current.name);
  }

  async function confirmDelete() {
    const current = watchlists.value.find(w => w.id === selectedWatchlistId.value);
    if (!current) return;
    if (current.isDefault) {
      f7.dialog.alert('Cannot delete default watchlist');
      return;
    }

    f7.dialog.confirm(`Delete "${current.name}"?`, 'Delete Watchlist', async () => {
      try {
        await watchlistStore.deleteWatchlist(current.id);
        selectedWatchlistId.value = watchlistStore.defaultWatchlist?.id || null;
        f7.toast.show({ text: 'Watchlist deleted', closeTimeout: 2000 });
      } catch (e) {
        f7.toast.show({ text: 'Failed to delete', closeTimeout: 2000 });
      }
    });
  }

  return {
    showWatchlistActions,
    showCreateDialog,
    showRenameDialog,
    confirmDelete
  };
}
