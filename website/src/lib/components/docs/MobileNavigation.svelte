<script lang="ts">
    import * as Dialog from '$lib/components/ui/dialog';
    import * as m from '$lib/paraglide/messages';
    import Sidebar from './Sidebar.svelte';

    interface Props {
        open: boolean;
    }

    let { open = $bindable(false) }: Props = $props();
</script>

<Dialog.Root bind:open>
    <Dialog.Content class="mobile-navigation" closeLabel={m.close_menu()}>
        <Dialog.Title class="sr-only">{m.navigation()}</Dialog.Title>
        <Sidebar onNavigate={() => (open = false)} />
    </Dialog.Content>
</Dialog.Root>
